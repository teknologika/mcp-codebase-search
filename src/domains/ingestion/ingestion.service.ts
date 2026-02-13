/**
 * Ingestion Orchestration Service
 * 
 * Coordinates the complete ingestion pipeline:
 * - File scanning
 * - Parsing with Tree-sitter
 * - Embedding generation
 * - Storage in LanceDB
 * 
 * Handles re-ingestion by deleting existing chunks before storing new ones.
 * Processes files in batches for memory efficiency.
 * 
 * Requirements: 2.1, 2.3, 2.5, 2.6, 6.2, 6.3, 12.4, 14.1, 14.2, 14.3
 */

import type { Config, IngestionParams, IngestionStats, LanguageStats, Chunk, RescanResult } from '../../shared/types/index.js';
import { FileScannerService, type ScannedFile } from './file-scanner.service.js';
import { TreeSitterParsingService } from '../parsing/tree-sitter-parsing.service.js';
import type { EmbeddingService } from '../embedding/embedding.service.js';
import { LanceDBClientWrapper } from '../../infrastructure/lancedb/lancedb.client.js';
import { createLogger, startTimer, logMemoryUsage } from '../../shared/logging/index.js';
import type { Logger } from '../../shared/logging/logger.js';
import { classifyFile } from '../../shared/utils/file-classification.js';
import { calculateFileHash } from '../../shared/utils/file-hash.js';

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
  private lanceClient: LanceDBClientWrapper;
  private config: Config;
  private logger: Logger;

  constructor(
    embeddingService: EmbeddingService,
    lanceClient: LanceDBClientWrapper,
    config: Config
  ) {
    this.fileScanner = new FileScannerService();
    this.parser = new TreeSitterParsingService(config);
    this.embeddingService = embeddingService;
    this.lanceClient = lanceClient;
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
    const overallTimer = startTimer('ingestCodebase', this.logger, {
      codebaseName: params.name,
    });
    const { path: codebasePath, name: codebaseName } = params;

    this.logger.info('Starting codebase ingestion', {
      codebaseName,
      codebasePath,
    });

    // Log initial memory usage
    logMemoryUsage(this.logger, { phase: 'start', codebaseName });

    try {
      // Generate unique ingestion timestamp
      const ingestionTimestamp = new Date().toISOString();

      // Phase 1: Scan directory for files
      this.logger.info('Phase 1: Scanning directory', { codebasePath });
      progressCallback?.('Scanning directory', 0, 1);

      const scanTimer = startTimer('scanDirectory', this.logger);
      const { files, statistics: scanStats } = await this.fileScanner.scanDirectory(
        codebasePath,
        {
          respectGitignore: params.respectGitignore ?? true,
          skipHiddenDirectories: true,
          maxFileSize: this.config.ingestion.maxFileSize,
        }
      );
      scanTimer.end();

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

      const parseTimer = startTimer('parseAllFiles', this.logger, {
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

          // Calculate file hash for change detection
          const fileHash = await calculateFileHash(file.path);

          const chunks = await this.parser.parseFile(file.path, file.language as any);
          
          // Classify file and add metadata to chunks
          const classification = classifyFile(file.relativePath);
          const chunksWithMetadata = chunks.map(chunk => ({
            ...chunk,
            isTestFile: classification.isTest,
            isLibraryFile: classification.isLibrary,
            fileHash,
          }));
          
          allChunks.push(...chunksWithMetadata);

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
            fileHash,
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

      parseTimer.end();

      this.logger.info('Parsing completed', {
        totalChunks: allChunks.length,
        languages: Array.from(languageStats.keys()),
      });

      // Log memory after parsing
      logMemoryUsage(this.logger, { phase: 'afterParsing', codebaseName, chunkCount: allChunks.length });

      // Phase 3: Handle re-ingestion (delete existing chunks)
      const previousChunkCount = await this.handleReingestion(codebaseName);

      // Phase 4: Generate embeddings in batches
      this.logger.info('Phase 3: Generating embeddings', {
        chunkCount: allChunks.length,
        batchSize: this.config.ingestion.batchSize,
      });

      const embeddingTimer = startTimer('generateAllEmbeddings', this.logger, {
        chunkCount: allChunks.length,
      });

      const chunksWithEmbeddings = await this.generateEmbeddingsBatch(
        allChunks,
        progressCallback
      );

      embeddingTimer.end();

      // Log memory after embeddings
      logMemoryUsage(this.logger, { phase: 'afterEmbeddings', codebaseName, chunkCount: chunksWithEmbeddings.length });

      // Phase 5: Store in LanceDB
      this.logger.info('Phase 4: Storing chunks in LanceDB', {
        chunkCount: chunksWithEmbeddings.length,
      });

      const storeTimer = startTimer('storeAllChunks', this.logger, {
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

      storeTimer.end();

      // Calculate statistics
      const durationMs = overallTimer.end();
      const chunkDiff = allChunks.length - previousChunkCount;

      // Log final memory usage
      logMemoryUsage(this.logger, { phase: 'complete', codebaseName });

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
      overallTimer.end();
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
      const exists = await this.lanceClient.tableExists(codebaseName);
      
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
      const table = await this.lanceClient.getOrCreateTable(codebaseName);
      const previousCount = table ? await table.countRows() : 0;

      // Delete the table
      await this.lanceClient.deleteTable(codebaseName);

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
   * Store chunks in LanceDB
   */
  private async storeChunks(
    codebaseName: string,
    codebasePath: string,
    chunks: Array<Chunk & { embedding: number[] }>,
    ingestionTimestamp: string,
    _languageStats: Map<string, { fileCount: number; chunkCount: number }>,
    _fileCount: number,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    if (chunks.length === 0) {
      this.logger.warn('No chunks to store', { codebaseName });
      return;
    }

    // Store chunks in batches
    const batchSize = this.config.ingestion.batchSize;
    let storedCount = 0;
    let table: any = null;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      // Transform chunks to LanceDB row format
      const rows = batch.map((chunk, idx) => ({
        id: `${codebaseName}_${ingestionTimestamp}_${i + idx}`,
        vector: chunk.embedding,
        content: chunk.content || '',
        filePath: chunk.filePath || '',
        startLine: chunk.startLine || 0,
        endLine: chunk.endLine || 0,
        language: chunk.language || 'unknown',
        chunkType: chunk.chunkType || 'unknown',
        isTestFile: chunk.isTestFile || false,
        isLibraryFile: chunk.isLibraryFile || false,
        fileHash: chunk.fileHash || '',
        ingestionTimestamp,
        _codebaseName: codebaseName,
        _path: codebasePath,
        _lastIngestion: ingestionTimestamp,
      }));

      // Debug: Log first row structure
      if (i === 0 && rows.length > 0) {
        this.logger.debug('First row structure', {
          id: rows[0].id,
          vectorLength: rows[0].vector?.length,
          contentLength: rows[0].content.length,
          filePath: rows[0].filePath,
          hasAllFields: Object.keys(rows[0]).join(','),
        });
      }

      try {
        // For first batch, create table if it doesn't exist
        if (i === 0) {
          table = await this.lanceClient.getOrCreateTable(codebaseName);
          if (!table) {
            // Table doesn't exist, create it with first batch
            this.logger.info('Creating new table with first batch', {
              codebaseName,
              batchSize: rows.length,
            });
            table = await this.lanceClient.createTableWithData(codebaseName, rows);
            storedCount += batch.length;
            progressCallback?.('Storing chunks', storedCount, chunks.length);
            continue; // Skip the add() call below since we already created with data
          }
        }

        // Add batch to existing table
        await table.add(rows);

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

  /**
   * Rescan a codebase to detect and process only changed files
   * Performs incremental update by comparing file hashes
   * 
   * @param codebaseName - Name of the codebase to rescan
   * @param codebasePath - Path to the codebase directory
   * @param progressCallback - Optional callback for progress updates
   * @returns Statistics about the rescan operation
   */
  async rescanCodebase(
    codebaseName: string,
    codebasePath: string,
    progressCallback?: ProgressCallback
  ): Promise<RescanResult> {
    const overallTimer = startTimer('rescanCodebase', this.logger, { codebaseName });

    this.logger.info('Starting incremental codebase rescan', {
      codebaseName,
      codebasePath,
    });

    try {
      // Phase 1: Get stored file hashes from database
      this.logger.info('Phase 1: Retrieving stored file hashes');
      progressCallback?.('Retrieving stored hashes', 0, 1);

      const table = await this.lanceClient.getOrCreateTable(codebaseName);
      if (!table) {
        throw new IngestionError(`Codebase '${codebaseName}' not found`);
      }

      const rows = await table.query().toArray();
      const storedFileMap = new Map<string, { hash: string; chunkCount: number }>();

      for (const row of rows) {
        const filePath = row.filePath || '';
        if (!filePath) continue;

        if (!storedFileMap.has(filePath)) {
          storedFileMap.set(filePath, {
            hash: row.fileHash || '',
            chunkCount: 0,
          });
        }
        storedFileMap.get(filePath)!.chunkCount++;
      }

      this.logger.info('Stored file hashes retrieved', {
        storedFileCount: storedFileMap.size,
      });

      // Phase 2: Scan filesystem for current files
      this.logger.info('Phase 2: Scanning filesystem');
      progressCallback?.('Scanning filesystem', 0, 1);

      const { files } = await this.fileScanner.scanDirectory(codebasePath, {
        respectGitignore: true,
        skipHiddenDirectories: true,
        maxFileSize: this.config.ingestion.maxFileSize,
      });

      const supportedFiles = this.fileScanner.getSupportedFiles(files);

      // Phase 3: Calculate current file hashes and compare
      this.logger.info('Phase 3: Calculating file hashes and detecting changes');
      progressCallback?.('Detecting changes', 0, supportedFiles.length);

      const currentFileMap = new Map<string, string>(); // filePath -> hash
      const addedFiles: typeof supportedFiles = [];
      const modifiedFiles: typeof supportedFiles = [];
      const unchangedFiles: typeof supportedFiles = [];

      for (let i = 0; i < supportedFiles.length; i++) {
        const file = supportedFiles[i];
        progressCallback?.('Detecting changes', i + 1, supportedFiles.length);

        try {
          const currentHash = await calculateFileHash(file.path);
          currentFileMap.set(file.relativePath, currentHash);

          const storedFile = storedFileMap.get(file.relativePath);

          if (!storedFile) {
            // New file
            addedFiles.push(file);
            this.logger.debug('File added', { filePath: file.relativePath });
          } else if (storedFile.hash !== currentHash) {
            // Modified file
            modifiedFiles.push(file);
            this.logger.debug('File modified', {
              filePath: file.relativePath,
              oldHash: storedFile.hash,
              newHash: currentHash,
            });
          } else {
            // Unchanged file
            unchangedFiles.push(file);
          }
        } catch (error) {
          this.logger.warn('Failed to hash file, skipping', {
            filePath: file.relativePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Detect deleted files
      const deletedFiles: string[] = [];
      for (const [filePath] of storedFileMap) {
        if (!currentFileMap.has(filePath)) {
          deletedFiles.push(filePath);
          this.logger.debug('File deleted', { filePath });
        }
      }

      this.logger.info('Change detection completed', {
        added: addedFiles.length,
        modified: modifiedFiles.length,
        deleted: deletedFiles.length,
        unchanged: unchangedFiles.length,
      });

      // Phase 4: Delete chunks for modified and deleted files
      let chunksDeleted = 0;

      if (modifiedFiles.length > 0 || deletedFiles.length > 0) {
        this.logger.info('Phase 4: Deleting chunks for changed files');
        const filesToDelete = [
          ...modifiedFiles.map(f => f.relativePath),
          ...deletedFiles,
        ];

        for (const filePath of filesToDelete) {
          const storedFile = storedFileMap.get(filePath);
          if (storedFile) {
            chunksDeleted += storedFile.chunkCount;
          }

          // Delete chunks using SQL-like filter
          const escapedPath = filePath.replace(/'/g, "''");
          await table.delete(`\`filePath\` = '${escapedPath}'`);

          this.logger.debug('Deleted chunks for file', {
            filePath,
            chunkCount: storedFile?.chunkCount || 0,
          });
        }

        this.logger.info('Chunks deleted', { chunksDeleted });
      }

      // Phase 5: Process added and modified files
      const filesToProcess = [...addedFiles, ...modifiedFiles];
      let chunksAdded = 0;

      if (filesToProcess.length > 0) {
        this.logger.info('Phase 5: Processing changed files', {
          fileCount: filesToProcess.length,
        });

        const allChunks: Chunk[] = [];
        const ingestionTimestamp = new Date().toISOString();

        for (let i = 0; i < filesToProcess.length; i++) {
          const file = filesToProcess[i];
          progressCallback?.('Processing files', i + 1, filesToProcess.length);

          try {
            if (!file.language) continue;

            const fileHash = await calculateFileHash(file.path);
            const chunks = await this.parser.parseFile(file.path, file.language as any);

            const classification = classifyFile(file.relativePath);
            const chunksWithMetadata = chunks.map(chunk => ({
              ...chunk,
              isTestFile: classification.isTest,
              isLibraryFile: classification.isLibrary,
              fileHash,
            }));

            allChunks.push(...chunksWithMetadata);
          } catch (error) {
            this.logger.error(
              'Failed to parse file, skipping',
              error instanceof Error ? error : new Error(String(error)),
              { filePath: file.relativePath }
            );
          }
        }

        // Generate embeddings
        if (allChunks.length > 0) {
          this.logger.info('Generating embeddings for new chunks', {
            chunkCount: allChunks.length,
          });

          const chunksWithEmbeddings = await this.generateEmbeddingsBatch(
            allChunks,
            progressCallback
          );

          // Store chunks
          this.logger.info('Storing new chunks');
          await this.storeChunks(
            codebaseName,
            codebasePath,
            chunksWithEmbeddings,
            ingestionTimestamp,
            new Map(),
            filesToProcess.length,
            progressCallback
          );

          chunksAdded = allChunks.length;
        }
      }

      const durationMs = overallTimer.end();

      const result: RescanResult = {
        codebaseName,
        filesScanned: supportedFiles.length,
        filesAdded: addedFiles.length,
        filesModified: modifiedFiles.length,
        filesDeleted: deletedFiles.length,
        filesUnchanged: unchangedFiles.length,
        chunksAdded,
        chunksDeleted,
        durationMs,
      };

      this.logger.info('Rescan completed successfully', {
        codebaseName,
        filesScanned: result.filesScanned,
        filesAdded: result.filesAdded,
        filesModified: result.filesModified,
        filesDeleted: result.filesDeleted,
        filesUnchanged: result.filesUnchanged,
        chunksAdded: result.chunksAdded,
        chunksDeleted: result.chunksDeleted,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error) {
      overallTimer.end();
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Rescan failed',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, codebasePath }
      );
      throw new IngestionError(
        `Failed to rescan codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }
}
