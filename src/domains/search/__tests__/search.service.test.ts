/**
 * Unit tests for SearchService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchService, SearchError } from '../search.service.js';
import { LanceDBClientWrapper } from '../../../infrastructure/lancedb/lancedb.client.js';
import type { EmbeddingService } from '../../embedding/embedding.service.js';
import type { Config, SearchParams } from '../../../shared/types/index.js';
import { DEFAULT_CONFIG } from '../../../shared/config/config.js';

describe('SearchService', () => {
  let service: SearchService;
  let mockLanceClient: LanceDBClientWrapper;
  let mockEmbeddingService: EmbeddingService;
  let mockOpenTable: ReturnType<typeof vi.fn>;
  let config: Config;

  const createMockTable = (
    rows: unknown[],
    filteredRows: unknown[] = rows
  ) => {
    const mockFilteredQuery = {
      toArray: vi.fn().mockResolvedValue(filteredRows),
    };

    const mockLimitResult = {
      toArray: vi.fn().mockResolvedValue(rows),
      where: vi.fn().mockReturnValue(mockFilteredQuery),
    };

    const mockLimit = vi.fn().mockReturnValue(mockLimitResult);

    return {
      table: {
        search: vi.fn().mockReturnValue({
          limit: mockLimit,
        }),
      },
      mockLimit,
      mockWhere: mockLimitResult.where,
    };
  };

  beforeEach(() => {
    config = { ...DEFAULT_CONFIG };
    mockOpenTable = vi.fn();
    
    // Create mock embedding service
    mockEmbeddingService = {
      initialize: vi.fn(),
      generateEmbedding: vi.fn(),
      batchGenerateEmbeddings: vi.fn(),
      getModelName: vi.fn().mockReturnValue('test-model'),
      getEmbeddingDimension: vi.fn().mockReturnValue(384),
      isInitialized: vi.fn().mockReturnValue(true),
    };

    // Create mock LanceDB client
    mockLanceClient = {
      listTables: vi.fn(),
      getOrCreateTable: vi.fn(),
      tableExists: vi.fn(),
      getConnection: vi.fn().mockReturnValue({
        openTable: mockOpenTable,
      }),
    } as any;

    service = new SearchService(mockLanceClient, mockEmbeddingService, config);
  });

  describe('search', () => {
    it('should return empty results when no collections exist', async () => {
      vi.mocked(mockLanceClient.listTables).mockResolvedValue([]);
      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(
        new Array(384).fill(0)
      );

      const params: SearchParams = {
        query: 'test query',
      };

      const result = await service.search(params);

      expect(result.results).toEqual([]);
      expect(result.totalResults).toBe(0);
      expect(result.queryTime).toBeGreaterThanOrEqual(0);
    });

    it('should search and return ranked results', async () => {
      const mockQueryEmbedding = new Array(384).fill(0.1);
      const { table: mockTable } = createMockTable([
        {
          filePath: '/path/to/file1.ts',
          startLine: 10,
          endLine: 20,
          language: 'typescript',
          chunkType: 'function',
          content: 'function test() {}',
          _distance: 0.2,
          _codebaseName: 'test-project',
        },
        {
          filePath: '/path/to/file2.ts',
          startLine: 30,
          endLine: 40,
          language: 'typescript',
          chunkType: 'class',
          content: 'class Test {}',
          _distance: 0.5,
          _codebaseName: 'test-project',
        },
      ]);

      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockQueryEmbedding);
      vi.mocked(mockLanceClient.listTables).mockResolvedValue([
        {
          name: 'codebase_test-project_1_0_0',
          metadata: { codebaseName: 'test-project' },
        },
      ]);
      mockOpenTable.mockResolvedValue(mockTable as any);

      const params: SearchParams = {
        query: 'test query',
      };

      const result = await service.search(params);

      expect(result.results).toHaveLength(2);
      expect(result.totalResults).toBe(2);
      
      // Results should be ranked by similarity (descending)
      expect(result.results[0].similarityScore).toBeGreaterThan(result.results[1].similarityScore);
      expect(result.results[0].filePath).toBe('/path/to/file1.ts');
      expect(result.results[0].content).toBe('function test() {}');
    });

    it('should filter by codebase name', async () => {
      const mockQueryEmbedding = new Array(384).fill(0.1);

      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockQueryEmbedding);
      vi.mocked(mockLanceClient.tableExists).mockResolvedValue(true);
      const { table: mockTable } = createMockTable([]);

      mockOpenTable.mockResolvedValue(mockTable as any);

      const params: SearchParams = {
        query: 'test query',
        codebaseName: 'specific-project',
      };

      await service.search(params);

      expect(mockLanceClient.tableExists).toHaveBeenCalledWith('specific-project');
    });

    it('should filter by language', async () => {
      const mockQueryEmbedding = new Array(384).fill(0.1);
      const { table: mockTable, mockWhere } = createMockTable([], []);

      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockQueryEmbedding);
      vi.mocked(mockLanceClient.listTables).mockResolvedValue([
        {
          name: 'codebase_test-project_1_0_0',
          metadata: { codebaseName: 'test-project' },
        },
      ]);
      mockOpenTable.mockResolvedValue(mockTable as any);

      const params: SearchParams = {
        query: 'test query',
        language: 'typescript',
      };

      await service.search(params);

      expect(mockWhere).toHaveBeenCalledWith("language = 'typescript'");
    });

    it('should limit results to maxResults', async () => {
      const mockQueryEmbedding = new Array(384).fill(0.1);
      const { table: mockTable, mockLimit } = createMockTable([]);

      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockQueryEmbedding);
      vi.mocked(mockLanceClient.listTables).mockResolvedValue([
        {
          name: 'codebase_test-project_1_0_0',
          metadata: { codebaseName: 'test-project' },
        },
      ]);
      mockOpenTable.mockResolvedValue(mockTable as any);

      const params: SearchParams = {
        query: 'test query',
        maxResults: 10,
      };

      await service.search(params);

      expect(mockLimit).toHaveBeenCalledWith(100);
    });

    it('should use cached results for identical queries', async () => {
      const mockQueryEmbedding = new Array(384).fill(0.1);
      const { table: mockTable } = createMockTable([
        {
          filePath: '/path/to/file.ts',
          startLine: 10,
          endLine: 20,
          language: 'typescript',
          chunkType: 'function',
          content: 'function test() {}',
          _distance: 0.2,
          _codebaseName: 'test-project',
        },
      ]);

      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockQueryEmbedding);
      vi.mocked(mockLanceClient.listTables).mockResolvedValue([
        {
          name: 'codebase_test-project_1_0_0',
          metadata: { codebaseName: 'test-project' },
        },
      ]);
      mockOpenTable.mockResolvedValue(mockTable as any);

      const params: SearchParams = {
        query: 'test query',
      };

      // First search
      const result1 = await service.search(params);
      expect(mockTable.search).toHaveBeenCalledTimes(1);

      // Second search with same params should use cache
      const result2 = await service.search(params);
      expect(mockTable.search).toHaveBeenCalledTimes(1); // Not called again
      expect(result2).toEqual(result1);
    });

    it('should clear cache and recompute identical searches', async () => {
      const mockQueryEmbedding = new Array(384).fill(0.1);
      const { table: mockTable } = createMockTable([
        {
          filePath: '/path/to/file.ts',
          startLine: 10,
          endLine: 20,
          language: 'typescript',
          chunkType: 'function',
          content: 'function test() {}',
          _distance: 0.2,
          _codebaseName: 'test-project',
        },
      ]);

      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockQueryEmbedding);
      vi.mocked(mockLanceClient.listTables).mockResolvedValue([
        {
          name: 'codebase_test-project_1_0_0',
          metadata: { codebaseName: 'test-project' },
        },
      ]);
      mockOpenTable.mockResolvedValue(mockTable as any);

      const params: SearchParams = {
        query: 'test query',
      };

      const firstResult = await service.search(params);
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
      expect(service.getCacheStats().size).toBe(1);

      service.clearCache();
      expect(service.getCacheStats().size).toBe(0);

      const secondResult = await service.search(params);
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(2);
      expect(mockTable.search).toHaveBeenCalledTimes(2);
      expect(secondResult.results).toEqual(firstResult.results);
      expect(secondResult.totalResults).toBe(firstResult.totalResults);
      expect(secondResult.queryTime).toBeGreaterThanOrEqual(0);
    });

    it('should initialize embedding service when not initialized', async () => {
      vi.mocked(mockEmbeddingService.isInitialized).mockReturnValue(false);
      vi.mocked(mockEmbeddingService.initialize).mockResolvedValue(undefined);
      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(
        new Array(384).fill(0.1)
      );
      vi.mocked(mockLanceClient.listTables).mockResolvedValue([
        {
          name: 'codebase_test-project_1_0_0',
          metadata: { codebaseName: 'test-project' },
        },
      ]);
      const { table: mockTable } = createMockTable([
        {
          filePath: '/path/to/file.ts',
          startLine: 10,
          endLine: 20,
          language: 'typescript',
          chunkType: 'function',
          content: 'function test() {}',
          _distance: 0.2,
          _codebaseName: 'test-project',
        },
      ]);
      mockOpenTable.mockResolvedValue(mockTable as any);

      const params: SearchParams = {
        query: 'test query',
      };

      const result = await service.search(params);

      expect(mockEmbeddingService.initialize).toHaveBeenCalledTimes(1);
      expect(result.results).toHaveLength(1);
    });

    it('should throw SearchError on embedding generation failure', async () => {
      vi.mocked(mockEmbeddingService.generateEmbedding).mockRejectedValue(
        new Error('Embedding failed')
      );

      const params: SearchParams = {
        query: 'test query',
      };

      await expect(service.search(params)).rejects.toThrow(SearchError);
    });
  });

  describe('clearCache', () => {
    it('should clear the search cache', () => {
      service.clearCache();
      
      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = service.getCacheStats();
      
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('keys');
      expect(typeof stats.size).toBe('number');
      expect(Array.isArray(stats.keys)).toBe(true);
    });
  });
});
