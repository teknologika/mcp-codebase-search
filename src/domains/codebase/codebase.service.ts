/**
 * Codebase service for CRUD operations
 * Manages codebase metadata, statistics, and lifecycle operations
 */

import type { 
  CodebaseMetadata, 
  CodebaseStats, 
  LanguageStats, 
  ChunkTypeStats,
  Config,
  FileInfo,
  Language
} from '../../shared/types/index.js';
import { LanceDBClientWrapper } from '../../infrastructure/lancedb/lancedb.client.js';
import { createLogger } from '../../shared/logging/index.js';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const rootLogger = createLogger('info');
const logger = rootLogger.child('CodebaseService');

/**
 * Helper function to safely extract error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getScanAgeSeconds(lastIngestion: string): number | undefined {
  if (!lastIngestion) {
    return undefined;
  }

  const parsed = Date.parse(lastIngestion);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  const ageSeconds = Math.floor((Date.now() - parsed) / 1000);
  return ageSeconds >= 0 ? ageSeconds : undefined;
}

/**
 * Error thrown when codebase operations fail
 */
export class CodebaseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'CodebaseError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Service for managing codebases
 */
export class CodebaseService {
  private lanceClient: LanceDBClientWrapper;

  constructor(lanceClient: LanceDBClientWrapper, _config: Config) {
    this.lanceClient = lanceClient;
  }

  /**
   * List all codebases with metadata
   * Reads from metadata table with fallback to chunk tables for backward compatibility
   */
  async listCodebases(): Promise<CodebaseMetadata[]> {
    try {
      logger.debug('Listing all codebases');

      const codebases: CodebaseMetadata[] = [];
      const codebaseNames = new Set<string>();

      try {
        const metadataList = await this.lanceClient.listAllMetadata();

        if (metadataList.length > 0) {
          logger.debug('Retrieved codebases from metadata table', {
            count: metadataList.length,
          });

          for (const meta of metadataList) {
            const lastIngestion = meta.lastIngested;
            codebaseNames.add(meta.name);
            codebases.push({
              name: meta.name,
              path: meta.path,
              chunkCount: meta.chunkCount,
              fileCount: meta.fileCount,
              lastIngestion,
              lastScanAge: getScanAgeSeconds(lastIngestion),
              languages: meta.languages.map((l: any) => l.language || l),
              createdAt: meta.createdAt,
              lastModified: meta.lastModified,
              tableName: meta.tableName,
              status: meta.status,
              lastError: meta.lastError,
            });
          }
        }
      } catch (error) {
        logger.warn('Failed to read from metadata table, will read from chunk tables', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const tables = await this.lanceClient.listTables();

      for (const table of tables) {
        const metadata = table.metadata;
        if (!metadata?.codebaseName) {
          continue;
        }

        const codebaseName = metadata.codebaseName as string;
        if (codebaseNames.has(codebaseName)) {
          continue;
        }

        try {
          const lanceTable = await this.lanceClient.getConnection().openTable(table.name);
          const count = await lanceTable.countRows();

          let path = '';
          let fileCount = 0;
          let lastIngestion = '';
          let languages: string[] = [];

          try {
            const sample = await lanceTable.query().limit(1).toArray();
            if (sample.length > 0) {
              const firstRow = sample[0];
              path = firstRow._path || '';
              lastIngestion = firstRow._lastIngestion || firstRow._createdAt || '';

              const allRows = await lanceTable.query().select(['language', 'filePath']).toArray();
              const uniqueFiles = new Set<string>();
              const uniqueLanguages = new Set<string>();

              for (const row of allRows) {
                if (row.filePath) uniqueFiles.add(row.filePath);
                if (row.language) uniqueLanguages.add(row.language);
              }

              fileCount = uniqueFiles.size;
              languages = Array.from(uniqueLanguages);
            }
          } catch (error) {
            logger.warn('Could not read metadata from chunk table, using defaults', {
              tableName: table.name,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          codebases.push({
            name: codebaseName,
            path,
            chunkCount: count,
            fileCount,
            lastIngestion,
            lastScanAge: getScanAgeSeconds(lastIngestion),
            languages,
            status: count === 0 ? 'empty' : 'active',
          });
        } catch (err: unknown) {
          codebases.push({
            name: codebaseName,
            path: '',
            chunkCount: 0,
            fileCount: 0,
            lastIngestion: '',
            languages: [],
            status: 'corrupted',
            lastError: getErrorMessage(err),
          });
        }
      }

      logger.debug('Codebases listed successfully', {
        count: codebases.length,
        fromMetadata: codebaseNames.size,
        fromChunkTables: codebases.length - codebaseNames.size,
      });
      return codebases;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to list codebases',
        error instanceof Error ? error : new Error(errorMessage)
      );
      throw new CodebaseError(
        `Failed to list codebases: ${errorMessage}`,
        error
      );
    }
  }


  /**
   * Get detailed statistics for a codebase
   */
  async getCodebaseStats(name: string): Promise<CodebaseStats> {
    try {
      logger.debug('Getting codebase statistics', { codebaseName: name });

      const table = await this.lanceClient.getOrCreateTable(name);
      if (!table) {
        throw new CodebaseError(`Codebase '${name}' not found`);
      }
      
      // Get all rows to calculate statistics
      const rows = await table.query().toArray();
      
      const chunkCount = rows.length;

      // Calculate language distribution
      const languageMap = new Map<string, { fileCount: Set<string>; chunkCount: number }>();
      const chunkTypeMap = new Map<string, number>();
      const fileSet = new Set<string>();
      let totalSize = 0;
      let path = '';
      let lastIngestion = '';

      for (const row of rows) {
        const language = row.language || 'unknown';
        const filePath = row.filePath || '';
        const chunkType = row.chunkType || 'unknown';
        const content = row.content || '';

        // Get metadata from first row
        if (!path && row._path) path = row._path;
        if (!lastIngestion && (row._lastIngestion || row._createdAt)) {
          lastIngestion = row._lastIngestion || row._createdAt;
        }

        fileSet.add(filePath);
        totalSize += content.length;

        // Track language stats
        if (!languageMap.has(language)) {
          languageMap.set(language, { fileCount: new Set(), chunkCount: 0 });
        }
        const langStats = languageMap.get(language)!;
        langStats.fileCount.add(filePath);
        langStats.chunkCount++;

        // Track chunk type stats
        chunkTypeMap.set(chunkType, (chunkTypeMap.get(chunkType) || 0) + 1);
      }

      // Convert to arrays
      const languages: LanguageStats[] = Array.from(languageMap.entries()).map(
        ([language, stats]) => ({
          language,
          fileCount: stats.fileCount.size,
          chunkCount: stats.chunkCount,
        })
      );

      const chunkTypes: ChunkTypeStats[] = Array.from(chunkTypeMap.entries()).map(
        ([type, count]) => ({
          type,
          count,
        })
      );

      const stats: CodebaseStats = {
        name,
        path,
        chunkCount,
        fileCount: fileSet.size,
        lastIngestion,
        languages,
        chunkTypes,
        sizeBytes: totalSize,
      };

      logger.debug('Codebase statistics retrieved successfully', {
        codebaseName: name,
        chunkCount,
        fileCount: fileSet.size,
      });

      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to get codebase statistics',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName: name }
      );
      throw new CodebaseError(
        `Failed to get statistics for codebase '${name}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Rename a codebase and propagate to all chunk metadata
   */
  /**
     * Rename a codebase and propagate to all chunk metadata
     */
    async renameCodebase(oldName: string, newName: string): Promise<void> {
      try {
        logger.debug('Renaming codebase', { oldName, newName });

        // Get the old table
        const oldTable = await this.lanceClient.getOrCreateTable(oldName);
        if (!oldTable) {
          throw new CodebaseError(`Codebase '${oldName}' not found`);
        }

        // Get all rows from old table
        const rows = await oldTable.query().toArray();

        if (rows.length === 0) {
          logger.warn('No chunks found in codebase to rename', { oldName });
        }

        // Validate and sanitize vector data
        const sanitizedRows = rows
          .map((row: any) => {
            // Check if vector field exists and is valid
            if (row.vector && Array.isArray(row.vector) && row.vector.length > 0) {
              // Validate that all vector elements are numbers
              const isValidVector = row.vector.every((val: any) => 
                typeof val === 'number' && !isNaN(val) && isFinite(val)
              );

              if (isValidVector) {
                return row;
              } else {
                logger.warn('Invalid vector data found, skipping chunk', {
                  filePath: row.filePath,
                  startLine: row.startLine,
                  vectorLength: row.vector?.length,
                  vectorSample: row.vector?.slice(0, 3)
                });
                return null;
              }
            } else {
              logger.warn('Missing or invalid vector field, skipping chunk', {
                filePath: row.filePath,
                startLine: row.startLine,
                hasVector: !!row.vector,
                vectorType: typeof row.vector
              });
              return null;
            }
          })
          .filter((row: any) => row !== null);

        logger.info('Vector validation completed', {
          originalRows: rows.length,
          validRows: sanitizedRows.length,
          skippedRows: rows.length - sanitizedRows.length
        });

        // Update codebaseName in all valid rows
        const updatedRows = sanitizedRows.map((row: any) => ({
          ...row,
          _codebaseName: newName,
          _renamedFrom: oldName,
          _renamedAt: new Date().toISOString(),
        }));

        // Create new table with updated data
        if (updatedRows.length > 0) {
          await this.lanceClient.createTableWithData(newName, updatedRows);
        } else {
          logger.warn('No valid chunks to rename after vector validation', { oldName });
        }

        // Delete old table
        await this.lanceClient.deleteTable(oldName);

        logger.debug('Codebase renamed successfully', {
          oldName,
          newName,
          chunksUpdated: updatedRows.length,
          chunksSkipped: rows.length - updatedRows.length,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          'Failed to rename codebase',
          error instanceof Error ? error : new Error(errorMessage),
          { oldName, newName }
        );
        throw new CodebaseError(
          `Failed to rename codebase from '${oldName}' to '${newName}': ${errorMessage}`,
          error
        );
      }
    }

  /**
   * Delete a codebase and all its chunks
   */
  /**
     * Delete a codebase and all its chunks
     */
    async deleteCodebase(name: string): Promise<void> {
      try {
        logger.debug('Deleting codebase', { codebaseName: name });

        // Delete the chunk table
        await this.lanceClient.deleteTable(name);

        // Delete metadata entry
        try {
          await this.lanceClient.deleteMetadata(name);
        } catch (error) {
          // Log but don't fail if metadata deletion fails
          logger.warn('Failed to delete metadata, continuing', {
            codebaseName: name,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        logger.debug('Codebase deleted successfully', { codebaseName: name });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          'Failed to delete codebase',
          error instanceof Error ? error : new Error(errorMessage),
          { codebaseName: name }
        );
        throw new CodebaseError(
          `Failed to delete codebase '${name}': ${errorMessage}`,
          error
        );
      }
    }


  /**
   * Delete chunks from a specific ingestion timestamp
   */
  async deleteChunkSet(codebaseName: string, timestamp: string): Promise<number> {
    try {
      logger.debug('Deleting chunk set', { codebaseName, timestamp });

      const table = await this.lanceClient.getOrCreateTable(codebaseName);
      if (!table) {
        throw new CodebaseError(`Codebase '${codebaseName}' not found`);
      }

      // Count chunks with the specified timestamp
      const rows = await table.query()
        .where(`ingestionTimestamp = '${timestamp}'`)
        .toArray();

      const chunkCount = rows.length;

      if (chunkCount === 0) {
        logger.warn('No chunks found with specified timestamp', {
          codebaseName,
          timestamp,
        });
        return 0;
      }

      // Delete the chunks
      await table.delete(`ingestionTimestamp = '${timestamp}'`);

      logger.debug('Chunk set deleted successfully', {
        codebaseName,
        timestamp,
        chunksDeleted: chunkCount,
      });

      return chunkCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to delete chunk set',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, timestamp }
      );
      throw new CodebaseError(
        `Failed to delete chunk set for codebase '${codebaseName}' at timestamp '${timestamp}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * List all unique files in a codebase
   * @param codebaseName - Name of the codebase
   * @returns Array of file metadata
   */
  async listFiles(codebaseName: string): Promise<FileInfo[]> {
    try {
      logger.debug('Listing files', { codebaseName });

      const table = await this.lanceClient.getOrCreateTable(codebaseName);
      if (!table) {
        throw new CodebaseError(`Codebase '${codebaseName}' not found`);
      }

      // Query all rows and aggregate by filePath
      const rows = await table.query().toArray();
      const filesMap = new Map<string, FileInfo>();

      for (const row of rows) {
        const filePath = row.filePath || '';
        if (!filePath) continue;

        if (!filesMap.has(filePath)) {
          filesMap.set(filePath, {
            filePath,
            language: (row.language || 'javascript') as Language,
            chunkCount: 0,
            lastIngestion: row.ingestionTimestamp || '',
            sizeBytes: 0,
            isTestFile: row.isTestFile || false,
            isLibraryFile: row.isLibraryFile || false,
            fileHash: row.fileHash || '',
          });
        }

        const file = filesMap.get(filePath)!;
        file.chunkCount++;
        file.sizeBytes += (row.content || '').length;

        // Update to latest ingestion timestamp and hash
        if (row.ingestionTimestamp && row.ingestionTimestamp > file.lastIngestion) {
          file.lastIngestion = row.ingestionTimestamp;
          file.fileHash = row.fileHash || '';
        }
      }

      const files = Array.from(filesMap.values());

      logger.debug('Files listed successfully', {
        codebaseName,
        fileCount: files.length,
      });

      return files;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to list files',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName }
      );
      throw new CodebaseError(
        `Failed to list files in codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Delete all chunks for a specific file from a codebase
   * @param codebaseName - Name of the codebase
   * @param filePath - Relative path to the file to remove
   * @returns Number of chunks deleted
   */
  async deleteFile(codebaseName: string, filePath: string): Promise<number> {
    try {
      logger.debug('Deleting file', { codebaseName, filePath });

      // Validate inputs
      if (!filePath || filePath.trim() === '') {
        throw new CodebaseError('File path cannot be empty');
      }

      // Security: Prevent path traversal
      if (filePath.includes('..') || filePath.startsWith('/')) {
        throw new CodebaseError('Invalid file path: path traversal not allowed');
      }

      const table = await this.lanceClient.getOrCreateTable(codebaseName);
      if (!table) {
        throw new CodebaseError(`Codebase '${codebaseName}' not found`);
      }

      // Count chunks before deletion
      const beforeCount = await table.countRows();

      // Escape single quotes in filePath for SQL filter
      const escapedFilePath = filePath.replace(/'/g, "''");

      // Delete chunks matching filePath
      // Use backticks for field names with mixed case in LanceDB
      await table.delete(`\`filePath\` = '${escapedFilePath}'`);

      // Count chunks after deletion
      const afterCount = await table.countRows();
      const deletedCount = beforeCount - afterCount;

      logger.info('File deleted', {
        codebaseName,
        filePath,
        chunksDeleted: deletedCount,
      });

      return deletedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to delete file',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, filePath }
      );
      throw new CodebaseError(
        `Failed to delete file '${filePath}' from codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get codebase path for rescan operations
   * Retrieves the stored path from codebase metadata
   * 
   * @param codebaseName - Name of the codebase
   * @returns The stored path for the codebase
   */
  async getCodebasePath(codebaseName: string): Promise<string> {
    try {
      logger.debug('Getting codebase path', { codebaseName });

      const codebases = await this.listCodebases();
      const codebase = codebases.find(cb => cb.name === codebaseName);

      if (!codebase) {
        throw new CodebaseError(`Codebase '${codebaseName}' not found`);
      }

      if (!codebase.path) {
        throw new CodebaseError(`Codebase '${codebaseName}' has no stored path`);
      }

      // Verify the path still exists
      try {
        const pathStats = await stat(codebase.path);
        if (!pathStats.isDirectory()) {
          throw new CodebaseError(`Path '${codebase.path}' is not a directory`);
        }
      } catch (error) {
        throw new CodebaseError(
          `Path '${codebase.path}' does not exist or is not accessible`,
          error
        );
      }

      return codebase.path;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to get codebase path',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName }
      );
      throw new CodebaseError(
        `Failed to get path for codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get full content for a specific chunk
   * @param codebaseName - Name of the codebase
   * @param filePath - Relative file path
   * @param startLine - Starting line number
   * @param endLine - Ending line number
   * @returns Chunk with full content
   */
  async getChunkContent(
    codebaseName: string,
    filePath: string,
    startLine: number,
    endLine: number
  ): Promise<{
    codebaseName: string;
    filePath: string;
    startLine: number;
    endLine: number;
    language: string;
    chunkType: string;
    content: string;
    lineNumberDrift?: number;
  }> {
    try {
      logger.debug('Getting chunk content', {
        codebaseName,
        filePath,
        startLine,
        endLine,
      });

      const table = await this.lanceClient.getOrCreateTable(codebaseName);
      if (!table) {
        throw new CodebaseError(`Codebase '${codebaseName}' not found`);
      }

      // Normalize file path: if it's an absolute path, try to get the codebase path
      // and convert to relative path for consistent querying
      let normalizedFilePath = filePath;
      if (path.isAbsolute(filePath)) {
        const codebasePath = await this.getCodebasePath(codebaseName).catch((error) => {
          throw new CodebaseError(
            `Cannot resolve absolute path '${filePath}': codebase has no stored path. Use a relative path or re-ingest.`,
            error
          );
        });
        normalizedFilePath = path.relative(codebasePath, filePath);
        logger.debug('Normalized absolute path to relative', {
          original: filePath,
          normalized: normalizedFilePath,
          codebasePath,
        });
      }

      // Escape single quotes in filePath for SQL filter
      const escapedFilePath = normalizedFilePath.replace(/'/g, "''");

      // Query for the specific chunk
      const exactRows = await table
        .query()
        .where(
          `\`filePath\` = '${escapedFilePath}' AND \`startLine\` = ${startLine} AND \`endLine\` = ${endLine}`
        )
        .limit(1)
        .toArray();

      let row = exactRows[0];
      let lineNumberDrift: number | undefined;

      if (!row) {
        const fuzzyRows = await table
          .query()
          .where(
            `\`filePath\` = '${escapedFilePath}' AND \`startLine\` >= ${startLine - 5} AND \`startLine\` <= ${startLine + 5}`
          )
          .toArray();

        if (fuzzyRows.length === 0) {
          throw new CodebaseError(
            `Chunk not found after trying original path '${filePath}' and normalized path '${normalizedFilePath}' with lines ${startLine}-${endLine} in codebase '${codebaseName}'`
          );
        }

        row = fuzzyRows.reduce((closest, candidate) => {
          if (!closest) {
            return candidate;
          }

          const closestStartLine = Number(closest.startLine || 0);
          const candidateStartLine = Number(candidate.startLine || 0);
          const closestDistance = Math.abs(closestStartLine - startLine);
          const candidateDistance = Math.abs(candidateStartLine - startLine);

          return candidateDistance < closestDistance ? candidate : closest;
        }, fuzzyRows[0]);

        const actualStartLine = Number(row.startLine || 0);
        lineNumberDrift = startLine - actualStartLine;
      }

      logger.debug('Chunk content retrieved successfully', {
        codebaseName,
        filePath: normalizedFilePath,
        contentLength: row.content?.length || 0,
      });

      return {
        codebaseName,
        filePath: row.filePath || normalizedFilePath,
        startLine: row.startLine || startLine,
        endLine: row.endLine || endLine,
        language: row.language || 'unknown',
        chunkType: row.chunkType || 'unknown',
        content: row.content || '',
        ...(lineNumberDrift !== undefined ? { lineNumberDrift } : {}),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to get chunk content',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, filePath, startLine, endLine }
      );
      throw new CodebaseError(
        `Failed to get chunk content for ${filePath}:${startLine}-${endLine} in codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get entire file content by reconstructing from all chunks
   * @param codebaseName - Name of the codebase
   * @param filePath - Relative file path
   * @returns Complete file content with metadata
   */
  async getFileContent(
      codebaseName: string,
      filePath: string
    ): Promise<{
      codebaseName: string;
      filePath: string;
      language: string;
      content: string;
      chunkCount: number;
      totalLines: number;
    }> {
      try {
        logger.debug('Getting file content', { codebaseName, filePath });

        const table = await this.lanceClient.getOrCreateTable(codebaseName);
        if (!table) {
          throw new CodebaseError(`Codebase '${codebaseName}' not found`);
        }

        // Get the codebase root path
        const codebasePath = await this.getCodebasePath(codebaseName);

        // Normalize the file path - handle both relative and absolute paths
        let normalizedFilePath = filePath;
        if (path.isAbsolute(filePath)) {
          // Convert absolute path to relative path from codebase root
          normalizedFilePath = path.relative(codebasePath, filePath);
        }

        // Escape single quotes in filePath for SQL filter
        const escapedFilePath = normalizedFilePath.replace(/'/g, "''");

        // Query for all chunks of this file
        const rows = await table
          .query()
          .where(`\`filePath\` = '${escapedFilePath}'`)
          .toArray();

        if (rows.length === 0) {
          throw new CodebaseError(
            `File not found: ${normalizedFilePath} in codebase '${codebaseName}'`
          );
        }

        // Get full file content from the first chunk (where it's stored)
        const firstChunk = rows.find(row => row.fullFileContent);
        
        if (!firstChunk || !firstChunk.fullFileContent) {
          throw new CodebaseError(
            `File content not available in database for ${normalizedFilePath}. Re-ingest the codebase with storeFullFiles enabled.`
          );
        }
        
        const content = firstChunk.fullFileContent;
        logger.debug('Retrieved full file content from database', {
          codebaseName,
          filePath: normalizedFilePath,
          contentLength: content.length,
        });

        // Get metadata from chunks
        const language = rows[0].language || 'unknown';
        const lines = content.split('\n');
        const totalLines = lines.length;

        logger.debug('File content retrieved successfully', {
          codebaseName,
          filePath: normalizedFilePath,
          chunkCount: rows.length,
          contentLength: content.length,
          totalLines,
        });

        return {
          codebaseName,
          filePath: normalizedFilePath,
          language,
          content,
          chunkCount: rows.length,
          totalLines,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          'Failed to get file content',
          error instanceof Error ? error : new Error(errorMessage),
          { codebaseName, filePath }
        );
        throw new CodebaseError(
          `Failed to get file content for ${filePath} in codebase '${codebaseName}': ${errorMessage}`,
          error
        );
      }
    }
}
