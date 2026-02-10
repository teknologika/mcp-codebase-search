/**
 * Codebase service for CRUD operations
 * Manages codebase metadata, statistics, and lifecycle operations
 */

import type { 
  CodebaseMetadata, 
  CodebaseStats, 
  LanguageStats, 
  ChunkTypeStats,
  Config 
} from '../../shared/types/index.js';
import { ChromaDBClientWrapper } from '../../infrastructure/chromadb/chromadb.client.js';
import { createLogger } from '../../shared/logging/index.js';

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
  private chromaClient: ChromaDBClientWrapper;
  private config: Config;

  constructor(chromaClient: ChromaDBClientWrapper, config: Config) {
    this.chromaClient = chromaClient;
    this.config = config;
  }

  /**
   * List all codebases with metadata
   */
  async listCodebases(): Promise<CodebaseMetadata[]> {
    try {
      logger.info('Listing all codebases');

      const collections = await this.chromaClient.listCollections();
      const codebases: CodebaseMetadata[] = [];

      for (const collection of collections) {
        const metadata = collection.metadata;
        
        // Only include collections that are codebase collections
        if (!metadata?.codebaseName) {
          continue;
        }

        const codebaseName = metadata.codebaseName as string;
        
        // Get collection to query chunk count
        const collectionName = ChromaDBClientWrapper.getCollectionName(codebaseName);
        const col = await this.chromaClient.getClient().getCollection({
          name: collectionName,
        });

        const count = await col.count();
        
        // Extract metadata
        const path = (metadata.path as string) || '';
        const fileCount = (metadata.fileCount as number) || 0;
        const lastIngestion = (metadata.lastIngestion as string) || (metadata.createdAt as string) || '';
        const languages = (metadata.languages as string[]) || [];

        codebases.push({
          name: codebaseName,
          path,
          chunkCount: count,
          fileCount,
          lastIngestion,
          languages,
        });
      }

      logger.info('Codebases listed successfully', { count: codebases.length });
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
      logger.info('Getting codebase statistics', { codebaseName: name });

      const collectionName = ChromaDBClientWrapper.getCollectionName(name);
      const col = await this.chromaClient.getClient().getCollection({
        name: collectionName,
      });

      // Get all chunks to calculate statistics
      const result = await col.get({
        include: ['metadatas'],
      });

      const chunkCount = result.ids.length;
      const metadatas = result.metadatas || [];

      // Calculate language distribution
      const languageMap = new Map<string, { fileCount: Set<string>; chunkCount: number }>();
      const chunkTypeMap = new Map<string, number>();
      const fileSet = new Set<string>();
      let totalSize = 0;

      for (const metadata of metadatas) {
        if (!metadata) continue;

        const language = (metadata.language as string) || 'unknown';
        const filePath = (metadata.filePath as string) || '';
        const chunkType = (metadata.chunkType as string) || 'unknown';
        const content = (metadata.content as string) || '';

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

      // Get collection metadata
      const collectionMetadata = await this.chromaClient.getCollectionMetadata(name);
      const path = (collectionMetadata?.path as string) || '';
      const lastIngestion = (collectionMetadata?.lastIngestion as string) || 
                           (collectionMetadata?.createdAt as string) || '';

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

      logger.info('Codebase statistics retrieved successfully', {
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
      logger.info('Renaming codebase', { oldName, newName });

      // Get the old collection
      const oldCollectionName = ChromaDBClientWrapper.getCollectionName(oldName);
      const oldCol = await this.chromaClient.getClient().getCollection({
        name: oldCollectionName,
      });

      // Get all chunks from old collection
      const result = await oldCol.get({
        include: ['embeddings', 'metadatas', 'documents'],
      });

      if (result.ids.length === 0) {
        logger.warn('No chunks found in codebase to rename', { oldName });
      }

      // Get old collection metadata
      const oldMetadata = await this.chromaClient.getCollectionMetadata(oldName);

      // Create new collection with updated metadata
      const newMetadata = {
        ...oldMetadata,
        codebaseName: newName,
        renamedFrom: oldName,
        renamedAt: new Date().toISOString(),
      };

      await this.chromaClient.createCollection(newName, newMetadata);

      // Get new collection
      const newCollectionName = ChromaDBClientWrapper.getCollectionName(newName);
      const newCol = await this.chromaClient.getClient().getCollection({
        name: newCollectionName,
      });

      // Copy all chunks to new collection with updated metadata
      if (result.ids.length > 0) {
        const updatedMetadatas = result.metadatas.map((metadata) => ({
          ...metadata,
          codebaseName: newName,
        }));

        await newCol.add({
          ids: result.ids,
          embeddings: result.embeddings as number[][] | undefined,
          metadatas: updatedMetadatas,
          documents: result.documents as string[] | undefined,
        });
      }

      // Delete old collection
      await this.chromaClient.deleteCollection(oldName);

      logger.info('Codebase renamed successfully', {
        oldName,
        newName,
        chunksUpdated: result.ids.length,
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
      logger.info('Deleting codebase', { codebaseName: name });

      await this.chromaClient.deleteCollection(name);

      logger.info('Codebase deleted successfully', { codebaseName: name });
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
      logger.info('Deleting chunk set', { codebaseName, timestamp });

      const collectionName = ChromaDBClientWrapper.getCollectionName(codebaseName);
      const col = await this.chromaClient.getClient().getCollection({
        name: collectionName,
      });

      // Get all chunks with the specified timestamp
      const result = await col.get({
        where: { ingestionTimestamp: timestamp },
        include: ['metadatas'],
      });

      const chunkCount = result.ids.length;

      if (chunkCount === 0) {
        logger.warn('No chunks found with specified timestamp', {
          codebaseName,
          timestamp,
        });
        return 0;
      }

      // Delete the chunks
      await col.delete({
        where: { ingestionTimestamp: timestamp },
      });

      logger.info('Chunk set deleted successfully', {
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
}
