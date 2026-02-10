/**
 * Unit tests for SearchService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchService, SearchError } from '../search.service.js';
import { ChromaDBClientWrapper } from '../../../infrastructure/chromadb/chromadb.client.js';
import type { EmbeddingService } from '../../embedding/embedding.service.js';
import type { Config, SearchParams } from '../../../shared/types/index.js';
import { DEFAULT_CONFIG } from '../../../shared/config/config.js';

describe('SearchService', () => {
  let service: SearchService;
  let mockChromaClient: ChromaDBClientWrapper;
  let mockEmbeddingService: EmbeddingService;
  let config: Config;

  beforeEach(() => {
    config = { ...DEFAULT_CONFIG };
    
    // Create mock embedding service
    mockEmbeddingService = {
      initialize: vi.fn(),
      generateEmbedding: vi.fn(),
      batchGenerateEmbeddings: vi.fn(),
      getModelName: vi.fn().mockReturnValue('test-model'),
      getEmbeddingDimension: vi.fn().mockReturnValue(384),
      isInitialized: vi.fn().mockReturnValue(true),
    };

    // Create mock ChromaDB client
    mockChromaClient = {
      listCollections: vi.fn(),
      getClient: vi.fn(),
      collectionExists: vi.fn(),
    } as any;

    service = new SearchService(mockChromaClient, mockEmbeddingService, config);
  });

  describe('search', () => {
    it('should return empty results when no collections exist', async () => {
      vi.mocked(mockChromaClient.listCollections).mockResolvedValue([]);
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
      
      const mockCollection = {
        query: vi.fn().mockResolvedValue({
          ids: [['id1', 'id2']],
          metadatas: [[
            {
              filePath: '/path/to/file1.ts',
              startLine: 10,
              endLine: 20,
              language: 'typescript',
              chunkType: 'function',
              codebaseName: 'test-project',
            },
            {
              filePath: '/path/to/file2.ts',
              startLine: 30,
              endLine: 40,
              language: 'typescript',
              chunkType: 'class',
              codebaseName: 'test-project',
            },
          ]],
          documents: [['function test() {}', 'class Test {}']],
          distances: [[0.2, 0.5]],
        }),
      };

      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockQueryEmbedding);
      vi.mocked(mockChromaClient.listCollections).mockResolvedValue([
        {
          name: 'codebase_test-project_1_0_0',
          id: 'col1',
          metadata: { codebaseName: 'test-project' },
        },
      ]);
      vi.mocked(mockChromaClient.getClient).mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(mockCollection),
      } as any);

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
      vi.mocked(mockChromaClient.collectionExists).mockResolvedValue(true);
      
      const mockCollection = {
        query: vi.fn().mockResolvedValue({
          ids: [[]],
          metadatas: [[]],
          documents: [[]],
          distances: [[]],
        }),
      };

      vi.mocked(mockChromaClient.getClient).mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(mockCollection),
      } as any);

      const params: SearchParams = {
        query: 'test query',
        codebaseName: 'specific-project',
      };

      await service.search(params);

      expect(mockChromaClient.collectionExists).toHaveBeenCalledWith('specific-project');
    });

    it('should filter by language', async () => {
      const mockQueryEmbedding = new Array(384).fill(0.1);
      
      const mockCollection = {
        query: vi.fn().mockResolvedValue({
          ids: [[]],
          metadatas: [[]],
          documents: [[]],
          distances: [[]],
        }),
      };

      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockQueryEmbedding);
      vi.mocked(mockChromaClient.listCollections).mockResolvedValue([
        {
          name: 'codebase_test-project_1_0_0',
          id: 'col1',
          metadata: { codebaseName: 'test-project' },
        },
      ]);
      vi.mocked(mockChromaClient.getClient).mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(mockCollection),
      } as any);

      const params: SearchParams = {
        query: 'test query',
        language: 'typescript',
      };

      await service.search(params);

      expect(mockCollection.query).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { language: 'typescript' },
        })
      );
    });

    it('should limit results to maxResults', async () => {
      const mockQueryEmbedding = new Array(384).fill(0.1);
      
      const mockCollection = {
        query: vi.fn().mockResolvedValue({
          ids: [[]],
          metadatas: [[]],
          documents: [[]],
          distances: [[]],
        }),
      };

      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockQueryEmbedding);
      vi.mocked(mockChromaClient.listCollections).mockResolvedValue([
        {
          name: 'codebase_test-project_1_0_0',
          id: 'col1',
          metadata: { codebaseName: 'test-project' },
        },
      ]);
      vi.mocked(mockChromaClient.getClient).mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(mockCollection),
      } as any);

      const params: SearchParams = {
        query: 'test query',
        maxResults: 10,
      };

      await service.search(params);

      expect(mockCollection.query).toHaveBeenCalledWith(
        expect.objectContaining({
          nResults: 10,
        })
      );
    });

    it('should use cached results for identical queries', async () => {
      const mockQueryEmbedding = new Array(384).fill(0.1);
      
      const mockCollection = {
        query: vi.fn().mockResolvedValue({
          ids: [['id1']],
          metadatas: [[{
            filePath: '/path/to/file.ts',
            startLine: 10,
            endLine: 20,
            language: 'typescript',
            chunkType: 'function',
            codebaseName: 'test-project',
          }]],
          documents: [['function test() {}']],
          distances: [[0.2]],
        }),
      };

      vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockQueryEmbedding);
      vi.mocked(mockChromaClient.listCollections).mockResolvedValue([
        {
          name: 'codebase_test-project_1_0_0',
          id: 'col1',
          metadata: { codebaseName: 'test-project' },
        },
      ]);
      vi.mocked(mockChromaClient.getClient).mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(mockCollection),
      } as any);

      const params: SearchParams = {
        query: 'test query',
      };

      // First search
      const result1 = await service.search(params);
      expect(mockCollection.query).toHaveBeenCalledTimes(1);

      // Second search with same params should use cache
      const result2 = await service.search(params);
      expect(mockCollection.query).toHaveBeenCalledTimes(1); // Not called again
      expect(result2).toEqual(result1);
    });

    it('should throw SearchError when embedding service not initialized', async () => {
      vi.mocked(mockEmbeddingService.isInitialized).mockReturnValue(false);

      const params: SearchParams = {
        query: 'test query',
      };

      await expect(service.search(params)).rejects.toThrow(SearchError);
      await expect(service.search(params)).rejects.toThrow('Embedding service not initialized');
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
      expect(stats).toHaveProperty('entries');
      expect(typeof stats.size).toBe('number');
    });
  });
});
