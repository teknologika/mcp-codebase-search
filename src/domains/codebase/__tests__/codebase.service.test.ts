/**
 * Unit tests for CodebaseService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodebaseService, CodebaseError } from '../codebase.service.js';
import { ChromaDBClientWrapper } from '../../../infrastructure/chromadb/chromadb.client.js';
import type { Config } from '../../../shared/types/index.js';
import { DEFAULT_CONFIG } from '../../../shared/config/config.js';

describe('CodebaseService', () => {
  let service: CodebaseService;
  let mockChromaClient: ChromaDBClientWrapper;
  let config: Config;

  beforeEach(() => {
    config = { ...DEFAULT_CONFIG };
    
    // Create mock ChromaDB client
    mockChromaClient = {
      listCollections: vi.fn(),
      getClient: vi.fn(),
      getCollectionMetadata: vi.fn(),
      createCollection: vi.fn(),
      deleteCollection: vi.fn(),
      collectionExists: vi.fn(),
    } as any;

    service = new CodebaseService(mockChromaClient, config);
  });

  describe('listCodebases', () => {
    it('should return empty array when no collections exist', async () => {
      vi.mocked(mockChromaClient.listCollections).mockResolvedValue([]);

      const result = await service.listCodebases();

      expect(result).toEqual([]);
      expect(mockChromaClient.listCollections).toHaveBeenCalledOnce();
    });

    it('should return codebases with metadata', async () => {
      const mockCollections = [
        {
          name: 'codebase_test-project_1_0_0',
          id: 'col1',
          metadata: {
            codebaseName: 'test-project',
            path: '/path/to/project',
            fileCount: 10,
            lastIngestion: '2024-01-01T00:00:00Z',
            languages: ['typescript', 'javascript'],
          },
        },
      ];

      const mockCollection = {
        count: vi.fn().mockResolvedValue(50),
      };

      vi.mocked(mockChromaClient.listCollections).mockResolvedValue(mockCollections);
      vi.mocked(mockChromaClient.getClient).mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(mockCollection),
      } as any);

      const result = await service.listCodebases();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'test-project',
        path: '/path/to/project',
        chunkCount: 50,
        fileCount: 10,
        lastIngestion: '2024-01-01T00:00:00Z',
        languages: ['typescript', 'javascript'],
      });
    });

    it('should skip collections without codebaseName metadata', async () => {
      const mockCollections = [
        {
          name: 'some-other-collection',
          id: 'col1',
          metadata: {},
        },
      ];

      vi.mocked(mockChromaClient.listCollections).mockResolvedValue(mockCollections);

      const result = await service.listCodebases();

      expect(result).toEqual([]);
    });

    it('should throw CodebaseError on failure', async () => {
      vi.mocked(mockChromaClient.listCollections).mockRejectedValue(
        new Error('Connection failed')
      );

      await expect(service.listCodebases()).rejects.toThrow(CodebaseError);
      await expect(service.listCodebases()).rejects.toThrow('Failed to list codebases');
    });
  });

  describe('deleteCodebase', () => {
    it('should delete codebase collection', async () => {
      vi.mocked(mockChromaClient.deleteCollection).mockResolvedValue();

      await service.deleteCodebase('test-project');

      expect(mockChromaClient.deleteCollection).toHaveBeenCalledWith('test-project');
    });

    it('should throw CodebaseError on deletion failure', async () => {
      vi.mocked(mockChromaClient.deleteCollection).mockRejectedValue(
        new Error('Delete failed')
      );

      await expect(service.deleteCodebase('test-project')).rejects.toThrow(CodebaseError);
    });
  });

  describe('deleteChunkSet', () => {
    it('should delete chunks with specific timestamp', async () => {
      const mockCollection = {
        get: vi.fn().mockResolvedValue({
          ids: ['id1', 'id2', 'id3'],
          metadatas: [{}, {}, {}],
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChromaClient.getClient).mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(mockCollection),
      } as any);

      const result = await service.deleteChunkSet('test-project', '2024-01-01T00:00:00Z');

      expect(result).toBe(3);
      expect(mockCollection.get).toHaveBeenCalledWith({
        where: { ingestionTimestamp: '2024-01-01T00:00:00Z' },
        include: ['metadatas'],
      });
      expect(mockCollection.delete).toHaveBeenCalledWith({
        where: { ingestionTimestamp: '2024-01-01T00:00:00Z' },
      });
    });

    it('should return 0 when no chunks found', async () => {
      const mockCollection = {
        get: vi.fn().mockResolvedValue({
          ids: [],
          metadatas: [],
        }),
        delete: vi.fn(),
      };

      vi.mocked(mockChromaClient.getClient).mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(mockCollection),
      } as any);

      const result = await service.deleteChunkSet('test-project', '2024-01-01T00:00:00Z');

      expect(result).toBe(0);
      expect(mockCollection.delete).not.toHaveBeenCalled();
    });
  });
});
