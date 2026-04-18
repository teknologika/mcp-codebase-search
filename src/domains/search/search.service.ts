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
import { LanceDBClientWrapper } from '../../infrastructure/lancedb/lancedb.client.js';
import type { EmbeddingService } from '../embedding/embedding.service.js';
import { createLogger, startTimer } from '../../shared/logging/index.js';

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
  private lanceClient: LanceDBClientWrapper;
  private embeddingService: EmbeddingService;
  private config: Config;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(
    lanceClient: LanceDBClientWrapper,
    embeddingService: EmbeddingService,
    config: Config
  ) {
    this.lanceClient = lanceClient;
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
    const timer = startTimer('search', logger, {
      query: params.query.substring(0, 100),
      codebaseName: params.codebaseName,
      language: params.language,
    });

    try {
      logger.debug('Executing search', {
        query: params.query.substring(0, 100),
        codebaseName: params.codebaseName,
        language: params.language,
        maxResults: params.maxResults,
      });

      // Check cache first
      const cachedResults = this.getCachedResults(params);
      if (cachedResults) {
        const queryTime = timer.end();
        logger.debug('Returning cached search results', {
          resultCount: cachedResults.results.length,
          queryTime,
        });
        return cachedResults;
      }

      // Ensure embedding service is initialized (lazy initialization)
      if (!this.embeddingService.isInitialized()) {
        logger.info('Initializing embedding service on first search');
        await this.embeddingService.initialize();
      }

      // Generate query embedding
      logger.debug('Generating query embedding');
      const embeddingTimer = startTimer('generateQueryEmbedding', logger);
      const queryEmbedding = await this.embeddingService.generateEmbedding(params.query);
      embeddingTimer.end();

      // Determine which tables to search
      const tables = await this.getTablesToSearch(params.codebaseName);

      if (tables.length === 0) {
        logger.warn('No tables found to search', {
          codebaseName: params.codebaseName,
        });
        const queryTime = timer.end();
        const emptyResults: SearchResults = {
          query: params.query,
          results: [],
          totalResults: 0,
          queryTime,
        };
        return emptyResults;
      }

      // Search all relevant tables
      const allResults: SearchResult[] = [];
      const maxResults = params.maxResults || this.config.search.defaultMaxResults;
      // Fetch more results for boosting - we'll re-rank and limit after applying name boosts
      const vectorSearchLimit = Math.max(maxResults * 10, 50);

      for (const tableName of tables) {
        const tableTimer = startTimer('searchTable', logger, { tableName });
        try {
          // Open table directly by name instead of using getOrCreateTable
          const table = await this.lanceClient.getConnection().openTable(tableName);

          // Perform vector search with higher limit for re-ranking
          let query = table.search(queryEmbedding).limit(vectorSearchLimit);

          // Add metadata filters if specified
          const filters: string[] = [];
          
          if (params.language) {
            filters.push(`language = '${params.language}'`);
          }
          
          if (params.excludeTests) {
            filters.push(`isTestFile = false`);
          }
          
          if (params.excludeLibraries) {
            filters.push(`isLibraryFile = false`);
          }
          
          // Apply combined filter
          if (filters.length > 0) {
            query = query.where(filters.join(' AND '));
          }

          const searchResults = await query.toArray();

          // Process results
          for (const row of searchResults) {
            // Convert distance to similarity score
            // LanceDB returns L2 (Euclidean) distance for normalized embeddings
            // Typical ranges: 0.0 = perfect match, 1.0 = excellent, 1.5 = good, 2.0+ = lower
            // Convert to similarity score [0, 1] where 1 = perfect match
            let similarityScore = 0;
            if (row._distance !== undefined) {
              // Use a gentler exponential decay: e^(-distance/2)
              // This gives: distance 0 → 1.00, distance 1.0 → 0.61, distance 1.5 → 0.47, distance 2.0 → 0.37
              // Then apply a power curve to boost high scores
              const baseScore = Math.exp(-row._distance / 2);
              // Apply square root to compress the range and boost scores
              similarityScore = Math.sqrt(baseScore);
              // This gives: distance 0 → 1.00, distance 1.0 → 0.78, distance 1.5 → 0.69, distance 2.0 → 0.61
            }
            
            // Apply filename and symbol name boosting
            const originalScore = similarityScore;
            similarityScore = this.applyNameBoost(
              similarityScore,
              params.query,
              row.filePath || '',
              row.content || ''
            );
            
            if (similarityScore !== originalScore) {
              logger.debug('Applied name boost', {
                filePath: row.filePath,
                originalScore: originalScore.toFixed(4),
                boostedScore: similarityScore.toFixed(4),
                boost: (similarityScore - originalScore).toFixed(4)
              });
            }
            
            const result: SearchResult = {
              filePath: row.filePath || '',
              startLine: row.startLine || 0,
              endLine: row.endLine || 0,
              language: row.language || '',
              chunkType: row.chunkType || '',
              content: row.content || '',
              similarityScore,
              codebaseName: row._codebaseName || tableName,
            };

            allResults.push(result);
          }
          tableTimer.end();
        } catch (error) {
          tableTimer.end();
          logger.warn('Failed to search table', {
            tableName,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with other tables
        }
      }

      // Sort all results by similarity score in descending order
      allResults.sort((a, b) => b.similarityScore - a.similarityScore);

      // Limit to max results
      const limitedResults = allResults.slice(0, maxResults);

      const queryTime = timer.end();

      const results: SearchResults = {
        query: params.query,
        results: limitedResults,
        totalResults: limitedResults.length,
        queryTime,
      };

      // Cache the results
      this.setCachedResults(params, results);

      logger.debug('Search completed successfully', {
        resultCount: limitedResults.length,
        queryTime,
      });

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Search failed',
        error instanceof Error ? error : new Error(errorMessage),
        { query: params.query.substring(0, 100) }
      );
      throw new SearchError(
        `Search failed: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get list of tables to search based on codebase filter
   */
  private async getTablesToSearch(codebaseName?: string): Promise<string[]> {
    if (codebaseName) {
      // Search specific codebase
      const tableName = LanceDBClientWrapper.getTableName(codebaseName);
      const exists = await this.lanceClient.tableExists(codebaseName);
      
      if (!exists) {
        logger.warn('Codebase table not found', { codebaseName, tableName });
        return [];
      }

      return [tableName];
    }

    // Search all codebases
    const tables = await this.lanceClient.listTables();
    return tables
      .filter(t => t.metadata?.codebaseName)
      .map(t => t.name);
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
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Apply boosting to similarity score based on filename and symbol name matches
   * Boosts scores when query terms match:
   * - Filename (without extension)
   * - Class names in content
   * - Function/method names in content
   */
  private applyNameBoost(
    baseScore: number,
    query: string,
    filePath: string,
    content: string
  ): number {
    // Normalize query to lowercase and split into terms
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    if (queryTerms.length === 0) {
      return baseScore;
    }

    // Extract filename without extension
    const filename = filePath.split('/').pop() || '';
    const filenameWithoutExt = filename.replace(/\.[^.]+$/, '').toLowerCase();
    
    logger.debug('Name boost check', {
      query,
      queryTerms,
      filename,
      filenameWithoutExt,
      filePath
    });
    
    // Extract potential symbol names from content (class/function/method names)
    // Look for patterns like: class ClassName, function functionName, methodName(
    const symbolMatches = content.match(/(?:class|function|interface|enum)\s+(\w+)|(\w+)\s*\(/g) || [];
    const symbols = symbolMatches
      .map(m => {
        const match = m.match(/(?:class|function|interface|enum)\s+(\w+)|(\w+)\s*\(/);
        return match ? (match[1] || match[2] || '').toLowerCase() : '';
      })
      .filter(s => s.length > 0);

    let boost = 0;

    // Check each query term for matches
    for (const term of queryTerms) {
      // Exact filename match (highest boost)
      if (filenameWithoutExt === term) {
        boost += 0.25;
        continue;
      }
      
      // Partial filename match
      if (filenameWithoutExt.includes(term) || term.includes(filenameWithoutExt)) {
        boost += 0.15;
      }
      
      // Exact symbol name match
      if (symbols.some(s => s === term)) {
        boost += 0.20;
        continue;
      }
      
      // Partial symbol name match
      if (symbols.some(s => s.includes(term) || term.includes(s))) {
        boost += 0.10;
      }
    }

    // Cap the boost to avoid over-boosting
    boost = Math.min(boost, 0.35);
    
    // Apply boost: new_score = base_score + (boost * (1 - base_score))
    // This ensures scores stay in [0, 1] range and don't exceed 1.0
    const boostedScore = baseScore + (boost * (1 - baseScore));
    
    return Math.min(boostedScore, 1.0);
  }
}
