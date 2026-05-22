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

import type { Config, IngestionParams, IngestionStats, LanguageStats, Chunk, RescanResult, Language } from '../../shared/types/index.js';
import { FileScannerService, type ScannedFile } from './file-scanner.service.js';
import { TreeSitterParsingService } from '../parsing/tree-sitter-parsing.service.js';
import { PlainTextParsingService } from '../parsing/plaintext-parsing.service.js';
import { LanguageDetectionService } from '../parsing/language-detection.service.js';
import type { EmbeddingService } from '../embedding/embedding.service.js';
import { LanceDBClientWrapper } from '../../infrastructure/lancedb/lancedb.client.js';
import { createLogger, startTimer, logMemoryUsage } from '../../shared/logging/index.js';
import type { Logger } from '../../shared/logging/logger.js';
import { classifyFile } from '../../shared/utils/file-classification.js';
import { calculateFileHash } from '../../shared/utils/file-hash.js';
import { readFile } from 'fs/promises';

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

interface RescanChangeSnapshot {
  changedAt: string;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesChanged: number;
  changedFilePaths: string[];
}

function normalizeStoredChangeSnapshot(metadata: any): RescanChangeSnapshot | null {
  if (!metadata) {
    return null;
  }

  const filesAdded = Number(metadata.lastRescanFilesAdded || 0);
  const filesModified = Number(metadata.lastRescanFilesModified || 0);
  const filesDeleted = Number(metadata.lastRescanFilesDeleted || 0);
  const filesChanged = Number(metadata.lastRescanFilesChanged || filesAdded + filesModified + filesDeleted || 0);
  const changedAt = metadata.lastRescanChangedAt || '';
  const changedFilePaths = Array.isArray(metadata.lastRescanChangedFilePaths)
    ? metadata.lastRescanChangedFilePaths.filter((filePath: unknown): filePath is string => typeof filePath === 'string' && filePath.length > 0)
    : [];

  if (!changedAt && filesChanged <= 0 && filesAdded <= 0 && filesModified <= 0 && filesDeleted <= 0) {
    return null;
  }

  return {
    changedAt,
    filesAdded,
    filesModified,
    filesDeleted,
    filesChanged,
    changedFilePaths,
  };
}

function ensureUtf8BatchColumnHasValue<T extends Record<string, unknown>>(
  rows: T[],
  field: keyof T
): T[] {
  if (rows.length === 0) {
    return rows;
  }

  if (rows.some(row => typeof row[field] === 'string')) {
    return rows;
  }

  // Lance/Arrow can reject an appended Utf8 column when an entire batch is null.
  // Seeding one empty string keeps the offsets buffer valid without changing reads,
  // because callers already treat empty fullFileContent as "not available".
  return rows.map((row, index) => (
    index === 0
      ? { ...row, [field]: '' }
      : row
  ));
}

function summarizeBatchRows(rows: Array<Record<string, unknown>>): Record<string, unknown> {
  const uniqueFilePaths = new Set<string>();
  const uniqueVectorLengths = new Set<number>();
  let contentLengthMin = Number.POSITIVE_INFINITY;
  let contentLengthMax = 0;
  let fullFileContentStringCount = 0;
  let fullFileContentNullishCount = 0;
  let fullFileContentEmptyStringCount = 0;
  let rowsWithMissingVector = 0;

  for (const row of rows) {
    if (typeof row.filePath === 'string' && row.filePath.length > 0) {
      uniqueFilePaths.add(row.filePath);
    }

    if (Array.isArray(row.vector)) {
      uniqueVectorLengths.add(row.vector.length);
    } else {
      rowsWithMissingVector++;
    }

    const content = typeof row.content === 'string' ? row.content : '';
    contentLengthMin = Math.min(contentLengthMin, content.length);
    contentLengthMax = Math.max(contentLengthMax, content.length);

    if (typeof row.fullFileContent === 'string') {
      fullFileContentStringCount++;
      if (row.fullFileContent.length === 0) {
        fullFileContentEmptyStringCount++;
      }
    } else if (row.fullFileContent == null) {
      fullFileContentNullishCount++;
    }
  }

  return {
    rowCount: rows.length,
    uniqueFileCount: uniqueFilePaths.size,
    sampleFilePaths: Array.from(uniqueFilePaths).slice(0, 5),
    uniqueVectorLengths: Array.from(uniqueVectorLengths).sort((a, b) => a - b),
    rowsWithMissingVector,
    contentLengthRange: rows.length > 0
      ? { min: contentLengthMin, max: contentLengthMax }
      : null,
    fullFileContent: {
      stringCount: fullFileContentStringCount,
      emptyStringCount: fullFileContentEmptyStringCount,
      nullishCount: fullFileContentNullishCount,
    },
  };
}

/**
 * Ingestion orchestration service
 */
export class IngestionService {
  private fileScanner: FileScannerService;
  private astParser: TreeSitterParsingService;
  private plainTextParser: PlainTextParsingService;
  private languageDetection: LanguageDetectionService;
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
    this.astParser = new TreeSitterParsingService(config);
    this.plainTextParser = new PlainTextParsingService(config);
    this.languageDetection = new LanguageDetectionService();
    this.embeddingService = embeddingService;
    this.lanceClient = lanceClient;
    this.config = config;
    this.logger = rootLogger.child('IngestionService');
  }

  /**
   * Log a file that was dropped from the indexing pipeline.
   */
  private logDroppedFile(
    stage: 'parse' | 'embedding' | 'store',
    filePath: string,
    reason: string,
    details: Record<string, unknown> = {},
    droppedFilePaths?: Set<string>
  ): void {
    if (droppedFilePaths) {
      droppedFilePaths.add(filePath);
    }

    this.logger.warn('Dropping file from indexing pipeline', {
      stage,
      filePath,
      reason,
      ...details,
    });
  }

  /**
   * Log a batch of files that was dropped from the indexing pipeline.
   */
  private logDroppedFileBatch(
    filePaths: string[],
    reason: string,
    details: Record<string, unknown> = {},
    droppedFilePaths?: Set<string>
  ): void {
    if (droppedFilePaths) {
      for (const filePath of filePaths) {
        droppedFilePaths.add(filePath);
      }
    }

    this.logger.warn('Dropping files from indexing pipeline', {
      stage: 'store',
      filePaths,
      reason,
      ...details,
    });
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
      let filesSuccessfullyParsed = 0;
      let filesFailedToParse = 0;

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

          // Read full file content if storeFullFiles is enabled
          let fullFileContent: string | undefined;
          if (this.config.ingestion.storeFullFiles) {
            try {
              fullFileContent = await readFile(file.path, 'utf-8');
            } catch (error) {
              this.logger.warn('Failed to read full file content, continuing without it', {
                filePath: file.relativePath,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          let chunks = await this.parseFileWithAppropriateParser(file.path, file.language as any);
          
          // If no chunks were extracted, create a file-level chunk with full content
          if (chunks.length === 0 && fullFileContent) {
            this.logger.info('No chunks extracted, creating file-level chunk', {
              filePath: file.relativePath,
              language: file.language,
            });
            
            const lineCount = fullFileContent.split('\n').length;
            chunks = [{
              content: fullFileContent,
              startLine: 1,
              endLine: lineCount,
              chunkType: 'file' as const,
              language: file.language as any,
              filePath: file.relativePath, // Use relative path
            }];
          }
          
          // Convert absolute paths to relative paths in all chunks
          chunks = chunks.map(chunk => ({
            ...chunk,
            filePath: file.relativePath,
          }));
          
          // Track successful parse only if chunks were produced
          if (chunks.length > 0) {
            filesSuccessfullyParsed++;
          } else {
            filesFailedToParse++;
            this.logDroppedFile(
              'parse',
              file.relativePath,
              'file parsed successfully but produced no chunks and no full content was available',
              { language: file.language }
            );
          }
          
          // Classify file and add metadata to chunks
          const classification = classifyFile(file.relativePath);
          const chunksWithMetadata = chunks.map((chunk, index) => ({
            ...chunk,
            isTestFile: classification.isTest,
            isLibraryFile: classification.isLibrary,
            fileHash,
            fileMtime: file.mtime.toISOString(),
            // Store full file content only on the first chunk to avoid duplication
            fullFileContent: index === 0 ? fullFileContent : undefined,
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
            filesFailedToParse++;
            this.logDroppedFile('parse', file.relativePath, 'failed to parse file', {
              language: file.language,
              error: error instanceof Error ? error.message : String(error),
            });
          }
      }

      parseTimer.end();

      this.logger.info('Parsing completed', {
        totalChunks: allChunks.length,
        languages: Array.from(languageStats.keys()),
      });

      let totalSizeBytes = 0;
      const chunkTypeMap = new Map<string, number>();
      for (const chunk of allChunks) {
        totalSizeBytes += (chunk.content || '').length;
        const ct = chunk.chunkType || 'unknown';
        chunkTypeMap.set(ct, (chunkTypeMap.get(ct) || 0) + 1);
      }

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

      // Phase 6: Write metadata
      this.logger.info('Phase 5: Writing metadata');
      const maxFileMtime = this.getMaxTimestampFromChunks(allChunks);
      await this.writeMetadata(
        codebaseName,
        codebasePath,
        allChunks.length,
        supportedFiles.length,
        languageStats,
        ingestionTimestamp,
        maxFileMtime,
        totalSizeBytes,
        chunkTypeMap
      );

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
        filesSuccessfullyParsed,
        filesFailedToParse,
      };

      this.logger.info('Ingestion completed successfully', {
        codebaseName,
        ...stats,
        chunkDiff,
        previousChunkCount,
        filesSuccessfullyParsed,
        filesFailedToParse,
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
    progressCallback?: ProgressCallback,
    droppedFilePaths?: Set<string>
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
              this.logDroppedFile(
                'embedding',
                batch[j].filePath,
                'embedding generation failed for chunk',
                {
                  startLine: batch[j].startLine,
                  endLine: batch[j].endLine,
                },
                droppedFilePaths
              );
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
   * Store rows in LanceDB, falling back to smaller batches when a write fails.
   * This isolates a single bad row instead of dropping the entire batch.
   */
  private async storeRowsWithFallback(
    codebaseName: string,
    rows: Array<Record<string, any>>,
    table: any | null,
    batchIndex: number,
    droppedFilePaths?: Set<string>
  ): Promise<{ table: any | null; storedCount: number; droppedCount: number }> {
    if (rows.length === 0) {
      return { table, storedCount: 0, droppedCount: 0 };
    }

    const filePaths = rows
      .map((row) => row.filePath)
      .filter((filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0);

    try {
      if (!table) {
        table = await this.lanceClient.createTableWithData(codebaseName, rows);
      } else {
        await table.add(rows);
      }

      return { table, storedCount: rows.length, droppedCount: 0 };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const rowSummary = summarizeBatchRows(rows);

      if (rows.length === 1) {
        this.logDroppedFileBatch(
          filePaths,
          'failed to store row',
          {
            batchIndex,
            error: errorMessage,
            rowSummary,
          },
          droppedFilePaths
        );

        return { table, storedCount: 0, droppedCount: 1 };
      }

      this.logger.warn('Retrying failed storage batch with smaller batches', {
        batchIndex,
        rowCount: rows.length,
        error: errorMessage,
        rowSummary,
      });

      const midpoint = Math.floor(rows.length / 2);
      const left = await this.storeRowsWithFallback(
        codebaseName,
        rows.slice(0, midpoint),
        table,
        batchIndex,
        droppedFilePaths
      );
      const right = await this.storeRowsWithFallback(
        codebaseName,
        rows.slice(midpoint),
        left.table ?? table,
        batchIndex,
        droppedFilePaths
      );

      return {
        table: right.table ?? left.table ?? table,
        storedCount: left.storedCount + right.storedCount,
        droppedCount: left.droppedCount + right.droppedCount,
      };
    }
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
    progressCallback?: ProgressCallback,
    droppedFilePaths?: Set<string>
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
      const rows = ensureUtf8BatchColumnHasValue(batch.map((chunk, idx) => ({
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
        fileMtime: chunk.fileMtime || '',
        fullFileContent: chunk.fullFileContent || null, // Store full file content if available
        ingestionTimestamp,
        _codebaseName: codebaseName,
        _path: codebasePath,
        _lastIngestion: ingestionTimestamp,
      })), 'fullFileContent');

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

      if (i === 0) {
        table = await this.lanceClient.getOrCreateTable(codebaseName);
      }

      const result = await this.storeRowsWithFallback(
        codebaseName,
        rows,
        table,
        Math.floor(i / batchSize) + 1,
        droppedFilePaths
      );
      table = result.table;

      storedCount += result.storedCount;
      progressCallback?.('Storing chunks', storedCount, chunks.length);

      if (result.droppedCount > 0) {
        this.logger.warn('Batch stored with dropped rows', {
          batchIndex: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
          storedCount: result.storedCount,
          droppedCount: result.droppedCount,
          rowSummary: summarizeBatchRows(rows),
        });
      } else {
        this.logger.debug('Batch stored successfully', {
          batchIndex: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
        });
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
   * Parse a file using the appropriate parser based on language type
   * 
   * @param filePath - Path to the file
   * @param language - Detected language of the file
   * @returns Array of parsed chunks
   */
  private async parseFileWithAppropriateParser(
    filePath: string,
    language: Language
  ): Promise<Chunk[]> {
    // Check if this language requires AST parsing
    const requiresAst = this.languageDetection.requiresAstParsing(language);
    
    if (requiresAst) {
      // Use Tree-sitter for code files
      return await this.astParser.parseFile(filePath, language);
    } else {
      // Use plain text parser for non-code files
      return await this.plainTextParser.parseFile(filePath, language);
    }
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
      const existingTable = await this.lanceClient.getOrCreateTable(codebaseName);

      if (!existingTable) {
        this.logger.warn('No existing chunk table found, falling back to full ingestion', {
          codebaseName,
          codebasePath,
        });

        const ingestionStats = await this.ingestCodebase(
          {
            name: codebaseName,
            path: codebasePath,
            config: this.config,
          },
          progressCallback
        );

        const filesIndexed = ingestionStats.filesSuccessfullyParsed ?? ingestionStats.supportedFiles;
        const durationMs = overallTimer.end();

        return {
          codebaseName,
          filesScanned: ingestionStats.totalFiles,
          filesAdded: filesIndexed,
          filesModified: 0,
          filesDeleted: 0,
          filesUnchanged: 0,
          filesIndexed,
          filesDropped: Math.max(ingestionStats.totalFiles - filesIndexed, 0),
          chunksAdded: ingestionStats.chunksCreated,
          chunksDeleted: 0,
          durationMs,
          lastChangedFiles: filesIndexed,
          lastChangedAt: new Date().toISOString(),
          lastChangedFilePaths: [],
          addedFilePaths: [],
          modifiedFilePaths: [],
          deletedFilePaths: [],
          droppedFilePaths: [],
        };
      }

      // Phase 1: Get stored file hashes from database
      this.logger.info('Phase 1: Retrieving stored file hashes');
      progressCallback?.('Retrieving stored hashes', 0, 1);

      const table = existingTable;
      if (!table) {
        throw new IngestionError(`Codebase '${codebaseName}' not found`);
      }

      const existingMetadata = await this.lanceClient.getMetadata(codebaseName);
      const rows = await table.query().toArray();
      const storedFileMap = new Map<string, {
        hash: string;
        chunkCount: number;
        latestTimestamp: string;
      }>();

      for (const row of rows) {
        const filePath = row.filePath || '';
        if (!filePath) continue;

        const candidateTimestamp = row.fileMtime || row.ingestionTimestamp || row._lastIngestion || row._createdAt || '';
        const existing = storedFileMap.get(filePath);

        if (!existing) {
          storedFileMap.set(filePath, {
            hash: row.fileHash || '',
            chunkCount: 1,
            latestTimestamp: candidateTimestamp,
          });
          continue;
        }

        existing.chunkCount++;
        if (this.isNewerTimestamp(candidateTimestamp, existing.latestTimestamp)) {
          existing.latestTimestamp = candidateTimestamp;
          existing.hash = row.fileHash || existing.hash;
        }
      }

      this.logger.info('Stored file hashes retrieved', {
        storedFileCount: storedFileMap.size,
      });

      // Clear rows array to free memory - we only need the file map
      rows.length = 0;

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
      const droppedFilePaths = new Set<string>();

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
            
            // Read full file content if storeFullFiles is enabled
            let fullFileContent: string | undefined;
            if (this.config.ingestion.storeFullFiles) {
              try {
                fullFileContent = await readFile(file.path, 'utf-8');
              } catch (error) {
                this.logger.warn('Failed to read full file content, continuing without it', {
                  filePath: file.relativePath,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
            
            let chunks = await this.parseFileWithAppropriateParser(file.path, file.language as any);
            
            // If no chunks were extracted, create a file-level chunk with full content
            if (chunks.length === 0 && fullFileContent) {
              this.logger.info('No chunks extracted, creating file-level chunk', {
                filePath: file.relativePath,
                language: file.language,
              });
              
              const lineCount = fullFileContent.split('\n').length;
              chunks = [{
                content: fullFileContent,
                startLine: 1,
                endLine: lineCount,
                chunkType: 'file' as const,
                language: file.language as any,
                filePath: file.relativePath, // Use relative path
              }];
            } else if (chunks.length === 0) {
              this.logDroppedFile(
                'parse',
                file.relativePath,
                'file parsed successfully but produced no chunks and no full content was available',
                { language: file.language },
                droppedFilePaths
              );
            }
            
            // Convert absolute paths to relative paths in all chunks
            chunks = chunks.map(chunk => ({
              ...chunk,
              filePath: file.relativePath,
            }));

            const classification = classifyFile(file.relativePath);
            const chunksWithMetadata = chunks.map((chunk, index) => ({
              ...chunk,
              isTestFile: classification.isTest,
              isLibraryFile: classification.isLibrary,
              fileHash,
              fileMtime: file.mtime.toISOString(),
              // Store full file content only on the first chunk to avoid duplication
              fullFileContent: index === 0 ? fullFileContent : undefined,
            }));

            allChunks.push(...chunksWithMetadata);
          } catch (error) {
            this.logDroppedFile('parse', file.relativePath, 'failed to parse file', {
              error: error instanceof Error ? error.message : String(error),
            }, droppedFilePaths);
          }
        }

        // Generate embeddings
        if (allChunks.length > 0) {
          this.logger.info('Generating embeddings for new chunks', {
            chunkCount: allChunks.length,
          });

          const chunksWithEmbeddings = await this.generateEmbeddingsBatch(
            allChunks,
            progressCallback,
            droppedFilePaths
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
            progressCallback,
            droppedFilePaths
          );

          chunksAdded = allChunks.length;
        }
      }

      // Update lastIngestion timestamp for all chunks to reflect the rescan time
      const rescanTimestamp = new Date().toISOString();
      await this.updateLastIngestionTimestamp(codebaseName, rescanTimestamp);

      const currentChangeSnapshot: RescanChangeSnapshot = {
        changedAt: rescanTimestamp,
        filesAdded: addedFiles.length,
        filesModified: modifiedFiles.length,
        filesDeleted: deletedFiles.length,
        filesChanged: addedFiles.length + modifiedFiles.length + deletedFiles.length,
        changedFilePaths: [
          ...addedFiles.map(file => file.relativePath),
          ...modifiedFiles.map(file => file.relativePath),
          ...deletedFiles,
        ],
      };
      const storedChangeSnapshot = normalizeStoredChangeSnapshot(existingMetadata);
      const lastMeaningfulChange = currentChangeSnapshot.filesChanged > 0
        ? currentChangeSnapshot
        : storedChangeSnapshot;

      // Update metadata after rescan
      this.logger.info('Updating metadata after rescan');
      const rescanTable = await this.lanceClient.getOrCreateTable(codebaseName);
      if (rescanTable) {
        const rows = await rescanTable.query().toArray();
        const languageMap = new Map<string, { fileCount: Set<string>; chunkCount: number }>();
        const fileSet = new Set<string>();
        let rescanSizeBytes = 0;
        const rescanChunkTypeMap = new Map<string, number>();
        let maxFileMtime = '';

        for (const row of rows) {
          const language = row.language || 'unknown';
          const filePath = row.filePath || '';
          const candidateFileMtime = row.fileMtime || row.ingestionTimestamp || '';
          
          fileSet.add(filePath);
          rescanSizeBytes += (row.content || '').length;
          if (this.isNewerTimestamp(candidateFileMtime, maxFileMtime)) {
            maxFileMtime = candidateFileMtime;
          }

          if (!languageMap.has(language)) {
            languageMap.set(language, { fileCount: new Set(), chunkCount: 0 });
          }
          const langStats = languageMap.get(language)!;
          langStats.fileCount.add(filePath);
          langStats.chunkCount++;

          const ct = row.chunkType || row.chunktype || 'unknown';
          rescanChunkTypeMap.set(ct, (rescanChunkTypeMap.get(ct) || 0) + 1);
        }

        const languageStats = new Map<string, { fileCount: number; chunkCount: number }>();
        for (const [language, stats] of languageMap.entries()) {
          languageStats.set(language, {
            fileCount: stats.fileCount.size,
            chunkCount: stats.chunkCount,
          });
        }

        await this.writeMetadata(
          codebaseName,
          codebasePath,
          rows.length,
          fileSet.size,
          languageStats,
          rescanTimestamp,
          maxFileMtime || undefined,
          rescanSizeBytes,
          rescanChunkTypeMap,
          lastMeaningfulChange
        );

        const filesIndexed = fileSet.size;
        const filesDropped = Math.max(supportedFiles.length - filesIndexed, 0);
        const droppedFiles = Array.from(droppedFilePaths).sort();
        const lastChangedFiles = lastMeaningfulChange?.filesChanged || 0;
        const lastChangedAt = lastMeaningfulChange?.changedAt || undefined;
        const lastChangedFilePaths = lastMeaningfulChange?.changedFilePaths || [];

        const durationMs = overallTimer.end();

        const result: RescanResult = {
          codebaseName,
          filesScanned: supportedFiles.length,
          filesAdded: addedFiles.length,
          filesModified: modifiedFiles.length,
          filesDeleted: deletedFiles.length,
          filesUnchanged: unchangedFiles.length,
          filesIndexed,
          filesDropped,
          chunksAdded,
          chunksDeleted,
          durationMs,
          lastChangedFiles,
          lastChangedAt,
          lastChangedFilePaths,
          addedFilePaths: addedFiles.map(file => file.relativePath),
          modifiedFilePaths: modifiedFiles.map(file => file.relativePath),
          deletedFilePaths: [...deletedFiles],
          droppedFilePaths: droppedFiles,
        };

        this.logger.info('Rescan completed successfully', {
          codebaseName,
          filesScanned: result.filesScanned,
          filesIndexed: result.filesIndexed,
          filesDropped: result.filesDropped,
          droppedFileCount: droppedFiles.length,
          filesAdded: result.filesAdded,
          filesModified: result.filesModified,
          filesDeleted: result.filesDeleted,
          filesUnchanged: result.filesUnchanged,
          chunksAdded: result.chunksAdded,
          chunksDeleted: result.chunksDeleted,
          durationMs: result.durationMs,
          droppedFilePaths: result.droppedFilePaths,
        });

        return result;
      }

      // Clear maps to free memory before completing
      storedFileMap.clear();
      currentFileMap.clear();
      return {
        codebaseName,
        filesScanned: supportedFiles.length,
        filesAdded: addedFiles.length,
        filesModified: modifiedFiles.length,
        filesDeleted: deletedFiles.length,
        filesUnchanged: unchangedFiles.length,
        filesIndexed: 0,
        filesDropped: supportedFiles.length,
        chunksAdded,
        chunksDeleted,
        durationMs: overallTimer.end(),
        lastChangedFiles: lastMeaningfulChange?.filesChanged || 0,
        lastChangedAt: lastMeaningfulChange?.changedAt || undefined,
        lastChangedFilePaths: lastMeaningfulChange?.changedFilePaths || [],
        addedFilePaths: addedFiles.map(file => file.relativePath),
        modifiedFilePaths: modifiedFiles.map(file => file.relativePath),
        deletedFilePaths: [...deletedFiles],
        droppedFilePaths: Array.from(droppedFilePaths).sort(),
      };
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
  /**
   * Update the lastIngestion timestamp for all chunks in a codebase.
   * TODO: Implement when LanceDB supports safe in-place row updates.
   * Currently a no-op — timestamp is only updated when new chunks are added.
   */
  private async updateLastIngestionTimestamp(
    codebaseName: string,
    timestamp: string
  ): Promise<void> {
    this.logger.debug('Skipping lastIngestion timestamp update (not yet implemented safely)', {
      codebaseName,
      timestamp,
    });
  }

  /**
   * Write or update metadata for a codebase after successful ingestion
   */
  private async writeMetadata(
    codebaseName: string,
    codebasePath: string,
    chunkCount: number,
    fileCount: number,
    languageStats: Map<string, { fileCount: number; chunkCount: number }>,
    ingestionTimestamp: string,
    lastModified?: string,
    sizeBytes?: number,
    chunkTypes?: Map<string, number>,
    lastMeaningfulChange?: RescanChangeSnapshot | null
  ): Promise<void> {
    try {
      // Get existing metadata to preserve createdAt
      const existingMetadata = await this.lanceClient.getMetadata(codebaseName);

      const chunkTypeMap = chunkTypes ?? new Map<string, number>();
      const computedSizeBytes = sizeBytes ?? 0;
      const computedLastModified = lastModified || ingestionTimestamp;

      // Prepare metadata
      const metadata = {
        name: codebaseName,
        path: codebasePath,
        createdAt: existingMetadata?.createdAt || ingestionTimestamp,
        lastIngested: ingestionTimestamp,
        lastModified: computedLastModified,
        chunkCount,
        fileCount,
        sizeBytes: computedSizeBytes,
        languages: Array.from(languageStats.entries()).map(([language, stats]) => ({
          language,
          fileCount: stats.fileCount,
          chunkCount: stats.chunkCount,
        })),
        chunkTypes: Array.from(chunkTypeMap.entries()).map(([type, count]) => ({
          type,
          count,
        })),
        schemaVersion: LanceDBClientWrapper.getSchemaVersion(),
        tableName: LanceDBClientWrapper.getTableName(codebaseName),
        status: 'active' as const,
        lastRescanChangedAt: lastMeaningfulChange?.changedAt || existingMetadata?.lastRescanChangedAt,
        lastRescanFilesChanged: lastMeaningfulChange?.filesChanged ?? existingMetadata?.lastRescanFilesChanged ?? 0,
        lastRescanFilesAdded: lastMeaningfulChange?.filesAdded ?? existingMetadata?.lastRescanFilesAdded ?? 0,
        lastRescanFilesModified: lastMeaningfulChange?.filesModified ?? existingMetadata?.lastRescanFilesModified ?? 0,
        lastRescanFilesDeleted: lastMeaningfulChange?.filesDeleted ?? existingMetadata?.lastRescanFilesDeleted ?? 0,
        lastRescanChangedFilePaths: lastMeaningfulChange?.changedFilePaths ?? existingMetadata?.lastRescanChangedFilePaths ?? [],
      };

      await this.lanceClient.setMetadata(metadata);

      this.logger.debug('Metadata written successfully', {
        codebaseName,
        chunkCount,
        fileCount,
      });
    } catch (error) {
      // Log error but don't fail ingestion
      this.logger.error(
        'Failed to write metadata',
        error instanceof Error ? error : new Error(String(error)),
        { codebaseName }
      );
    }
  }

  private getMaxTimestampFromChunks(chunks: Chunk[]): string | undefined {
    let maxTimestamp = '';

    for (const chunk of chunks) {
      if (this.isNewerTimestamp(chunk.fileMtime, maxTimestamp)) {
        maxTimestamp = chunk.fileMtime!;
      }
    }

    return maxTimestamp || undefined;
  }

  private isNewerTimestamp(candidate?: string, currentMax?: string): boolean {
    if (!candidate) {
      return false;
    }

    const candidateMs = Date.parse(candidate);
    if (Number.isNaN(candidateMs)) {
      return false;
    }

    if (!currentMax) {
      return true;
    }

    const currentMaxMs = Date.parse(currentMax);
    if (Number.isNaN(currentMaxMs)) {
      return true;
    }

    return candidateMs > currentMaxMs;
  }


}
