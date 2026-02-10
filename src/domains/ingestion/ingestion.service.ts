/**
 * Ingestion Orchestration Service
 * 
 * Coordinates the complete ingestion pipeline:
 * - File scanning
 * - Parsing with Tree-sitter
 * - Embedding generation
 * - Storage in ChromaDB
 * 
 * Handles re-ingestion by deleting existing chunks before storing new ones.
 * Processes files in batches for memory efficiency.
 * 
 * Requirements: 2.1, 2.3, 2.5, 2.6, 6.2, 6.3, 12.4, 14.1, 14.2, 14.3
 */

import type { Config, IngestionParams, IngestionStats, LanguageStats, Chunk } from '../../shared/types/index.js';
import { FileScannerService, type ScannedFile } from './file-scanner.service.js';
import { TreeSitterParsingService } from '../parsing/tree-sitter-parsing.service.js';
import type { EmbeddingService } from '../embedding/embedding.service.js';
import { ChromaDBClientWrapper } from '../../infrastructure/chromadb/chromadb.client.js';
import { createLogger } from '../../shared/logging/index.js';
import type { Logger } from '../../shared/logging/logger.js';

const rootLogger = createLogger('info');

/**
 * Error thrown when ingestion operations fail
 */
export class IngestionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'IngestionError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Progress callback for ingestion operations
 */
export type ProgressCallback = (phase: string, current: number, total: number) => void;

/**
 * Ingestion orchestration service
 */
export class IngestionService {
  private fileScanner: FileScannerService;
  private parser: TreeSitterParsingService;
  private embeddingService: EmbeddingService;
  private chromaClient: ChromaDBClientWrapper;
  private config: Config;
  private logger: Logger;

  constructor(
    embeddingService: EmbeddingService,
    chromaClient: ChromaDBClientWrapper,
    config: Config
  ) {
    this.fileScanner = new FileScannerService();
    this.parser = new TreeSitterParsingService();
    this.embeddingService = embeddingService;
    this.chromaClient = chromaClient;
    this.config = config;
    this.logger = rootLogger.child('IngestionService');
  }

  /**
   * Ingest a codebase
   * 
   * @param params - Ingestion parameters
   * @param progressCallback - Optional callback for progress updates
   * @returns Ingestion statistics
   */
  async ingestCodebase(
    params: IngestionParams,
    progressCallback?: ProgressCallback
  ): Promise<IngestionStats> {
    const startTime = Date.now();
    const { path: codebasePath, name: codebaseName } = params;

    this.logger.info('Starting codebase ingestion', {
      codebaseName,
      codebasePath,
    });

    try {
      // Generate unique ingestion timestamp
      const ingestionTimestamp = new Date().toISOString();

      // Phase 1: Scan directory for files
      this.logger.info('Phase 1: Scanning directory', { codebasePath });
      progressCallback?.('Scanning directory', 0, 1);

      const { files, statistics: scanStats } = await this.fileScanner.scanDirectory(
        codebasePath,
        {
          respectGitignore: true,
          skipHiddenDirectories: true,
          maxFileSize: this.config.ingestion.maxFileSize,
        }
      );

      const supportedFiles = this.fileScanner.getSupportedFiles(files);
      const unsupportedFiles = this.fileScanner.getUnsupportedFiles(files);

      this.logger.info('Directory scan completed', {
        totalFiles: scanStats.totalFiles,
        supportedFiles: scanStats.supportedFiles,
        unsupportedFiles: scanStats.unsupportedFiles,
      });

      // Log warnings for unsupported files
      this.logUnsupportedFiles(unsupportedFiles);

      // Phase 2: Parse files and extract chunks
      this.logger.info('Phase 2: Parsing files and extracting chunks', {
        fileCount: supportedFiles.length,
      });

      const allChunks: Chunk[] = [];
      const languageStats = new Map<string, { fileCount: number; chunkCount: number }>();

      for (let i = 0; i < supportedFiles.length; i++) {
        const file = supportedFiles[i];
        progressCallback?.('Parsing files', i + 1, supportedFiles.length);

        try {
          if (!file.language) {
            this.logger.warn('File has no language detected, skipping', {
              filePath: file.path,
            });
            continue;
          }

          const chunks = await this.parser.parseFile(file.path, file.language as any);
          allChunks.push(...chunks);

          // Update language statistics
          const langKey = file.language;
          if (!languageStats.has(langKey)) {
            languageStats.set(langKey, { fileCount: 0, chunkCount: 0 });
          }
          const stats = languageStats.get(langKey)!;
          stats.fileCount++;
          stats.chunkCount += chunks.length;

          this.logger.debug('File parsed successfully', {
            filePath: file.relativePath,
            language: file.language,
            chunkCount: chunks.length,
          });
        } catch (error) {
          // Log error but continue with other files
          this.logger.error(
            'Failed to parse file, skipping',
            error instanceof Error ? error : new Error(String(error)),
            {
              filePath: file.relativePath,
              language: file.language,
            }
          );
        }
      }

      this.logger.info('Parsing completed', {
        totalChunks: allChunks.length,
        languages: Array.from(languageStats.keys()),
      });

      // Phase 3: Handle re-ingestion (delete existing chunks)
      const previousChunkCount = await this.handleReingestion(codebaseName);

      // Phase 4: Generate embeddings in batches
      this.logger.info('Phase 3: Generating embeddings', {
        chunkCount: allChunks.length,
        batchSize: this.config.ingestion.batchSize,
      });

      const chunksWithEmbeddings = await this.generateEmbeddingsBatch(
        allChunks,
        progressCallback
      );

      // Phase 5: Store in ChromaDB
      this.logger.info('Phase 4: Storing chunks in ChromaDB', {
        chunkCount: chunksWithEmbeddings.length,
      });

      await this.storeChunks(
        codebaseName,
        codebasePath,
        chunksWithEmbeddings,
        ingestionTimestamp,
        languageStats,
        supportedFiles.length,
        progressCallback
      );

      // Calculate statistics
      const durationMs = Date.now() - startTime;
      const chunkDiff = allChunks.length - previousChunkCount;

      const stats: IngestionStats = {
        totalFiles: scanStats.totalFiles,
        supportedFiles: scanStats.supportedFiles,
        unsupportedFiles: scanStats.unsupportedByExtension,
        chunksCreated: allChunks.length,
        languages: this.convertLanguageStats(languageStats),
        durationMs,
      };

      this.logger.info('Ingestion completed successfully', {
        codebaseName,
        ...stats,
        chunkDiff,
        previousChunkCount,
      });

      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Ingestion failed',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, codebasePath }
      );
      throw new IngestionError(
        `Failed to ingest codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Handle re-ingestion by deleting existing chunks
   * Returns the previous chunk count
   */
  private async handleReingestion(codebaseName: string): Promise<number> {
    try {
      const exists = await this.chromaClient.collectionExists(codebaseName);
      
      if (!exists) {
        this.logger.info('First-time ingestion, no existing chunks to delete', {
          codebaseName,
        });
        return 0;
      }

      this.logger.info('Re-ingestion detected, deleting existing chunks', {
        codebaseName,
      });

      // Get current chunk count before deletion
      const collectionName = ChromaDBClientWrapper.getCollectionName(codebaseName);
      const col = await this.chromaClient.getClient().getCollection({
        name: collectionName,
        embeddingFunction: this.chromaClient.getEmbeddingFunction(),
      });
      const previousCount = await col.count();

      // Delete the collection
      await this.chromaClient.deleteCollection(codebaseName);

      this.logger.info('Existing chunks deleted', {
        codebaseName,
        previousChunkCount: previousCount,
      });

      return previousCount;
    } catch (error) {
      this.logger.error(
        'Failed to handle re-ingestion',
        error instanceof Error ? error : new Error(String(error)),
        { codebaseName }
      );
      throw error;
    }
  }

  /**
   * Generate embeddings for chunks in batches
   */
  private async generateEmbeddingsBatch(
    chunks: Chunk[],
    progressCallback?: ProgressCallback
  ): Promise<Array<Chunk & { embedding: number[] }>> {
    const batchSize = this.config.ingestion.batchSize;
    const chunksWithEmbeddings: Array<Chunk & { embedding: number[] }> = [];
    let processedCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchTexts = batch.map((chunk) => chunk.content);

      try {
        const embeddings = await this.embeddingService.batchGenerateEmbeddings(batchTexts);

        // Combine chunks with their embeddings
        for (let j = 0; j < batch.length; j++) {
          if (embeddings[j]) {
            chunksWithEmbeddings.push({
              ...batch[j],
              embedding: embeddings[j],
            });
          } else {
            this.logger.warn('Embedding generation failed for chunk, skipping', {
              filePath: batch[j].filePath,
              startLine: batch[j].startLine,
            });
          }
        }

        processedCount += batch.length;
        progressCallback?.('Generating embeddings', processedCount, chunks.length);

        this.logger.debug('Batch embeddings generated', {
          batchIndex: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
          successCount: embeddings.filter((e) => e).length,
        });
      } catch (error) {
        // Log error and continue with next batch
        this.logger.error(
          'Failed to generate embeddings for batch, skipping',
          error instanceof Error ? error : new Error(String(error)),
          {
            batchIndex: Math.floor(i / batchSize) + 1,
            batchSize: batch.length,
          }
        );
      }
    }

    return chunksWithEmbeddings;
  }

  /**
   * Store chunks in ChromaDB
   */
  private async storeChunks(
    codebaseName: string,
    codebasePath: string,
    chunks: Array<Chunk & { embedding: number[] }>,
    ingestionTimestamp: string,
    languageStats: Map<string, { fileCount: number; chunkCount: number }>,
    fileCount: number,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    if (chunks.length === 0) {
      this.logger.warn('No chunks to store', { codebaseName });
      return;
    }

    // Create or get collection
    await this.chromaClient.getOrCreateCollection(codebaseName, {
      path: codebasePath,
      fileCount,
      lastIngestion: ingestionTimestamp,
      languages: Array.from(languageStats.keys()),
    });

    const collectionName = ChromaDBClientWrapper.getCollectionName(codebaseName);
    const col = await this.chromaClient.getClient().getCollection({
      name: collectionName,
      embeddingFunction: this.chromaClient.getEmbeddingFunction(),
    });

    // Store chunks in batches
    const batchSize = this.config.ingestion.batchSize;
    let storedCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      const ids = batch.map((_, idx) => `${codebaseName}_${ingestionTimestamp}_${i + idx}`);
      const embeddings = batch.map((chunk) => chunk.embedding);
      const documents = batch.map((chunk) => chunk.content);
      const metadatas = batch.map((chunk) => ({
        codebaseName,
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        language: chunk.language,
        chunkType: chunk.chunkType,
        ingestionTimestamp,
      }));

      try {
        await col.add({
          ids,
          embeddings,
          documents,
          metadatas,
        });

        storedCount += batch.length;
        progressCallback?.('Storing chunks', storedCount, chunks.length);

        this.logger.debug('Batch stored successfully', {
          batchIndex: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
        });
      } catch (error) {
        this.logger.error(
          'Failed to store batch',
          error instanceof Error ? error : new Error(String(error)),
          {
            batchIndex: Math.floor(i / batchSize) + 1,
            batchSize: batch.length,
          }
        );
        throw error;
      }
    }

    this.logger.info('All chunks stored successfully', {
      codebaseName,
      chunkCount: storedCount,
    });
  }

  /**
   * Log warnings for unsupported files
   */
  private logUnsupportedFiles(unsupportedFiles: ScannedFile[]): void {
    if (unsupportedFiles.length === 0) {
      return;
    }

    // Group by extension
    const byExtension = new Map<string, string[]>();
    for (const file of unsupportedFiles) {
      const ext = file.extension || '(no extension)';
      if (!byExtension.has(ext)) {
        byExtension.set(ext, []);
      }
      byExtension.get(ext)!.push(file.relativePath);
    }

    // Log summary
    this.logger.warn('Unsupported files detected', {
      totalUnsupported: unsupportedFiles.length,
      byExtension: Array.from(byExtension.entries()).map(([ext, files]) => ({
        extension: ext,
        count: files.length,
      })),
    });

    // Log individual files at debug level
    for (const file of unsupportedFiles) {
      this.logger.debug('Skipping unsupported file', {
        filePath: file.relativePath,
        extension: file.extension,
      });
    }
  }

  /**
   * Convert language statistics map to array format
   */
  private convertLanguageStats(
    languageStats: Map<string, { fileCount: number; chunkCount: number }>
  ): Map<string, LanguageStats> {
    const result = new Map<string, LanguageStats>();
    
    for (const [language, stats] of languageStats.entries()) {
      result.set(language, {
        language,
        fileCount: stats.fileCount,
        chunkCount: stats.chunkCount,
      });
    }

    return result;
  }
}
