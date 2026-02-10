/**
 * Search service with semantic search capabilities
 * Provides vector similarity search with metadata filtering and result caching
 */

import type { 
  SearchParams, 
  SearchResults, 
  SearchResult,
  Config 
} from '../../shared/types/index.js';
import { ChromaDBClientWrapper } from '../../infrastructure/chromadb/chromadb.client.js';
import type { EmbeddingService } from '../embedding/embedding.service.js';
import { createLogger } from '../../shared/logging/index.js';

const rootLogger = createLogger('info');
const logger = rootLogger.child('SearchService');

/**
 * Error thrown when search operations fail
 */
export class SearchError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'SearchError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Cache entry for search results
 */
interface CacheEntry {
  results: SearchResults;
  timestamp: number;
}

/**
 * Service for semantic code search
 */
export class SearchService {
  private chromaClient: ChromaDBClientWrapper;
  private embeddingService: EmbeddingService;
  private config: Config;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(
    chromaClient: ChromaDBClientWrapper,
    embeddingService: EmbeddingService,
    config: Config
  ) {
    this.chromaClient = chromaClient;
    this.embeddingService = embeddingService;
    this.config = config;
  }

  /**
   * Generate cache key from search parameters
   */
  private getCacheKey(params: SearchParams): string {
    return JSON.stringify({
      query: params.query,
      codebaseName: params.codebaseName || null,
      language: params.language || null,
      maxResults: params.maxResults || this.config.search.defaultMaxResults,
    });
  }

  /**
   * Get cached results if available and not expired
   */
  private getCachedResults(params: SearchParams): SearchResults | null {
    const cacheKey = this.getCacheKey(params);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const cacheTimeoutMs = this.config.search.cacheTimeoutSeconds * 1000;

    if (now - entry.timestamp > cacheTimeoutMs) {
      // Cache expired
      this.cache.delete(cacheKey);
      logger.debug('Cache entry expired', { cacheKey });
      return null;
    }

    logger.debug('Cache hit', { cacheKey });
    return entry.results;
  }

  /**
   * Store results in cache
   */
  private setCachedResults(params: SearchParams, results: SearchResults): void {
    const cacheKey = this.getCacheKey(params);
    this.cache.set(cacheKey, {
      results,
      timestamp: Date.now(),
    });
    logger.debug('Results cached', { cacheKey, resultCount: results.results.length });
  }

  /**
   * Search codebases with semantic similarity
   */
  async search(params: SearchParams): Promise<SearchResults> {
    const startTime = Date.now();

    try {
      logger.info('Executing search', {
        query: params.query.substring(0, 100),
        codebaseName: params.codebaseName,
        language: params.language,
        maxResults: params.maxResults,
      });

      // Check cache first
      const cachedResults = this.getCachedResults(params);
      if (cachedResults) {
        logger.info('Returning cached search results', {
          resultCount: cachedResults.results.length,
          queryTime: Date.now() - startTime,
        });
        return cachedResults;
      }

      // Ensure embedding service is initialized
      if (!this.embeddingService.isInitialized()) {
        throw new SearchError('Embedding service not initialized');
      }

      // Generate query embedding
      logger.debug('Generating query embedding');
      const queryEmbedding = await this.embeddingService.generateEmbedding(params.query);

      // Determine which collections to search
      const collections = await this.getCollectionsToSearch(params.codebaseName);

      if (collections.length === 0) {
        logger.warn('No collections found to search', {
          codebaseName: params.codebaseName,
        });
        const emptyResults: SearchResults = {
          results: [],
          totalResults: 0,
          queryTime: Date.now() - startTime,
        };
        return emptyResults;
      }

      // Search all relevant collections
      const allResults: SearchResult[] = [];
      const maxResults = params.maxResults || this.config.search.defaultMaxResults;

      for (const collectionName of collections) {
        try {
          const col = await this.chromaClient.getClient().getCollection({
            name: collectionName,
          });

          // Build where clause for metadata filters
          const where: Record<string, any> = {};
          if (params.language) {
            where.language = params.language;
          }

          // Query ChromaDB with vector similarity
          const queryResults = await col.query({
            queryEmbeddings: [queryEmbedding],
            nResults: maxResults,
            where: Object.keys(where).length > 0 ? where : undefined,
            include: ['metadatas', 'documents', 'distances'],
          });

          // Process results
          if (queryResults.ids[0] && queryResults.ids[0].length > 0) {
            for (let i = 0; i < queryResults.ids[0].length; i++) {
              const metadata = queryResults.metadatas[0]?.[i];
              const document = queryResults.documents[0]?.[i];
              const distance = queryResults.distances?.[0]?.[i];

              if (!metadata || !document) {
                continue;
              }

              // Convert distance to similarity score (1 - distance for cosine distance)
              // ChromaDB uses L2 distance by default, but with normalized vectors it's similar to cosine
              const similarityScore = distance !== undefined ? 1 - distance : 0;

              const result: SearchResult = {
                filePath: (metadata.filePath as string) || '',
                startLine: (metadata.startLine as number) || 0,
                endLine: (metadata.endLine as number) || 0,
                language: (metadata.language as string) || '',
                chunkType: (metadata.chunkType as string) || '',
                content: document,
                similarityScore,
                codebaseName: (metadata.codebaseName as string) || '',
              };

              allResults.push(result);
            }
          }
        } catch (error) {
          logger.warn('Failed to search collection', {
            collectionName,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with other collections
        }
      }

      // Sort all results by similarity score in descending order
      allResults.sort((a, b) => b.similarityScore - a.similarityScore);

      // Limit to max results
      const limitedResults = allResults.slice(0, maxResults);

      const queryTime = Date.now() - startTime;

      const results: SearchResults = {
        results: limitedResults,
        totalResults: limitedResults.length,
        queryTime,
      };

      // Cache the results
      this.setCachedResults(params, results);

      logger.info('Search completed successfully', {
        resultCount: limitedResults.length,
        queryTime,
      });

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Search failed',
        error instanceof Error ? error : new Error(errorMessage),
        {
          query: params.query.substring(0, 100),
          codebaseName: params.codebaseName,
        }
      );
      throw new SearchError(
        `Search failed: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get list of collection names to search based on codebase filter
   */
  private async getCollectionsToSearch(codebaseName?: string): Promise<string[]> {
    if (codebaseName) {
      // Search specific codebase
      const collectionName = ChromaDBClientWrapper.getCollectionName(codebaseName);
      const exists = await this.chromaClient.collectionExists(codebaseName);
      
      if (!exists) {
        logger.warn('Codebase collection not found', { codebaseName });
        return [];
      }
      
      return [collectionName];
    } else {
      // Search all codebases
      const collections = await this.chromaClient.listCollections();
      return collections
        .filter(c => c.metadata?.codebaseName)
        .map(c => c.name);
    }
  }

  /**
   * Clear the search cache
   */
  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Search cache cleared', { entriesCleared: size });
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number } {
    return {
      size: this.cache.size,
      entries: this.cache.size,
    };
  }
}
