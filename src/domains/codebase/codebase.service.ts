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

const rootLogger = createLogger('info');
const logger = rootLogger.child('CodebaseService');

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
   */
  async listCodebases(): Promise<CodebaseMetadata[]> {
    try {
      logger.debug('Listing all codebases');

      const tables = await this.lanceClient.listTables();
      const codebases: CodebaseMetadata[]  = [];

      for (const table of tables) {
        const metadata = table.metadata;
        
        // Only include tables that are codebase tables
        if (!metadata?.codebaseName) {
          continue;
        }

        const codebaseName = metadata.codebaseName as string;
        
        // Open table directly by name
        const lanceTable = await this.lanceClient.getConnection().openTable(table.name);
        const count = await lanceTable.countRows();
        
        // Extract metadata from first row if available
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
            
            // Get unique languages and file count from all rows
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
          // Silently ignore metadata errors - table may be corrupted or incompatible
          // This is not critical for listing codebases
        }

        codebases.push({
          name: codebaseName,
          path,
          chunkCount: count,
          fileCount,
          lastIngestion,
          languages,
        });
      }

      logger.debug('Codebases listed successfully', { count: codebases.length });
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

      // Update codebaseName in all rows
      const updatedRows = rows.map((row: any) => ({
        ...row,
        _codebaseName: newName,
        _renamedFrom: oldName,
        _renamedAt: new Date().toISOString(),
      }));

      // Create new table with updated data
      if (updatedRows.length > 0) {
        await this.lanceClient.createTableWithData(newName, updatedRows);
      }

      // Delete old table
      await this.lanceClient.deleteTable(oldName);

      logger.debug('Codebase renamed successfully', {
        oldName,
        newName,
        chunksUpdated: rows.length,
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
  async deleteCodebase(name: string): Promise<void> {
    try {
      logger.debug('Deleting codebase', { codebaseName: name });

      await this.lanceClient.deleteTable(name);

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
}
