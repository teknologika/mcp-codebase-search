/**
 * Unit tests for Fastify API routes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerRoutes } from '../routes.js';
import type { CodebaseService } from '../../../domains/codebase/codebase.service.js';
import type { SearchService } from '../../../domains/search/search.service.js';
import type {
  CodebaseMetadata,
  CodebaseStats,
  SearchResults,
} from '../../../shared/types/index.js';

describe('Fastify API Routes', () => {
  let fastify: FastifyInstance;
  let mockCodebaseService: CodebaseService;
  let mockSearchService: SearchService;

  beforeEach(async () => {
    // Create fresh Fastify instance for each test
    fastify = Fastify({ logger: false });

    // Create mock services
    mockCodebaseService = {
      listCodebases: vi.fn(),
      getCodebaseStats: vi.fn(),
      renameCodebase: vi.fn(),
      deleteCodebase: vi.fn(),
      deleteChunkSet: vi.fn(),
    } as any;

    mockSearchService = {
      search: vi.fn(),
    } as any;

    // Register routes
    await registerRoutes(fastify, mockCodebaseService, mockSearchService);
  });

  describe('GET /api/codebases', () => {
    it('should return list of codebases', async () => {
      const mockCodebases: CodebaseMetadata[] = [
        {
          name: 'test-codebase',
          path: '/path/to/codebase',
          chunkCount: 100,
          fileCount: 10,
          lastModified: '2024-01-01T00:00:00Z',
          languages: ['typescript', 'javascript'],
        },
      ];

      vi.mocked(mockCodebaseService.listCodebases).mockResolvedValue(mockCodebases);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/codebases',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.codebases).toEqual(mockCodebases);
      expect(mockCodebaseService.listCodebases).toHaveBeenCalledOnce();
    });

    it('should return 500 on service error', async () => {
      vi.mocked(mockCodebaseService.listCodebases).mockRejectedValue(
        new Error('Database error')
      );

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/codebases',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Failed to list codebases');
    });
  });

  describe('POST /api/search', () => {
    it('should return search results with valid query', async () => {
      const mockResults: SearchResults = {
        query: 'test function',
        results: [
          {
            filePath: '/path/to/file.ts',
            startLine: 10,
            endLine: 20,
            language: 'typescript',
            chunkType: 'function',
            content: 'function test() {}',
            similarityScore: 0.95,
            codebaseName: 'test-codebase',
          },
        ],
        totalResults: 1,
        queryTime: 50,
      };

      vi.mocked(mockSearchService.search).mockResolvedValue(mockResults);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test function',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual(mockResults);
      expect(mockSearchService.search).toHaveBeenCalledWith({
        query: 'test function',
      });
    });

    it('should accept optional filters', async () => {
      const mockResults: SearchResults = {
        query: 'test',
        results: [],
        totalResults: 0,
        queryTime: 10,
      };

      vi.mocked(mockSearchService.search).mockResolvedValue(mockResults);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          codebaseName: 'my-codebase',
          language: 'typescript',
          maxResults: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockSearchService.search).toHaveBeenCalledWith({
        query: 'test',
        codebaseName: 'my-codebase',
        language: 'typescript',
        maxResults: 10,
      });
    });

    it('should return 400 for missing query', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/search',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid search parameters');
    });

    it('should return 400 for empty query', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid maxResults', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          maxResults: -1,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 500 on search error', async () => {
      vi.mocked(mockSearchService.search).mockRejectedValue(
        new Error('Search failed')
      );

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('GET /api/codebases/:name/stats', () => {
    it('should return codebase statistics', async () => {
      const mockStats: CodebaseStats = {
        name: 'test-codebase',
        path: '/path/to/codebase',
        chunkCount: 100,
        fileCount: 10,
        lastModified: '2024-01-01T00:00:00Z',
        languages: [
          { language: 'typescript', fileCount: 8, chunkCount: 80 },
          { language: 'javascript', fileCount: 2, chunkCount: 20 },
        ],
        chunkTypes: [
          { type: 'function', count: 60 },
          { type: 'class', count: 40 },
        ],
        sizeBytes: 50000,
      };

      vi.mocked(mockCodebaseService.getCodebaseStats).mockResolvedValue(mockStats);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/codebases/test-codebase/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual(mockStats);
      expect(mockCodebaseService.getCodebaseStats).toHaveBeenCalledWith('test-codebase');
    });

    it('should return 404 for non-existent codebase', async () => {
      vi.mocked(mockCodebaseService.getCodebaseStats).mockRejectedValue(
        new Error('Codebase not found')
      );

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/codebases/non-existent/stats',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 500 on service error', async () => {
      vi.mocked(mockCodebaseService.getCodebaseStats).mockRejectedValue(
        new Error('Database error')
      );

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/codebases/test-codebase/stats',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('PUT /api/codebases/:name', () => {
    it('should rename codebase successfully', async () => {
      vi.mocked(mockCodebaseService.renameCodebase).mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/codebases/old-name',
        payload: {
          newName: 'new-name',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('old-name');
      expect(body.message).toContain('new-name');
      expect(mockCodebaseService.renameCodebase).toHaveBeenCalledWith(
        'old-name',
        'new-name'
      );
    });

    it('should return 400 for missing newName', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/codebases/old-name',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent codebase', async () => {
      vi.mocked(mockCodebaseService.renameCodebase).mockRejectedValue(
        new Error('Codebase not found')
      );

      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/codebases/non-existent',
        payload: {
          newName: 'new-name',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 500 on service error', async () => {
      vi.mocked(mockCodebaseService.renameCodebase).mockRejectedValue(
        new Error('Database error')
      );

      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/codebases/old-name',
        payload: {
          newName: 'new-name',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('DELETE /api/codebases/:name', () => {
    it('should delete codebase successfully', async () => {
      vi.mocked(mockCodebaseService.deleteCodebase).mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/codebases/test-codebase',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('test-codebase');
      expect(mockCodebaseService.deleteCodebase).toHaveBeenCalledWith('test-codebase');
    });

    it('should return 404 for non-existent codebase', async () => {
      vi.mocked(mockCodebaseService.deleteCodebase).mockRejectedValue(
        new Error('Codebase not found')
      );

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/codebases/non-existent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 500 on service error', async () => {
      vi.mocked(mockCodebaseService.deleteCodebase).mockRejectedValue(
        new Error('Database error')
      );

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/codebases/test-codebase',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('DELETE /api/codebases/:name/chunk-sets/:timestamp', () => {
    it('should delete chunk set successfully', async () => {
      vi.mocked(mockCodebaseService.deleteChunkSet).mockResolvedValue(50);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/codebases/test-codebase/chunk-sets/2024-01-01T00:00:00Z',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.chunksDeleted).toBe(50);
      expect(body.message).toContain('50');
      expect(mockCodebaseService.deleteChunkSet).toHaveBeenCalledWith(
        'test-codebase',
        '2024-01-01T00:00:00Z'
      );
    });

    it('should return 404 for non-existent codebase', async () => {
      vi.mocked(mockCodebaseService.deleteChunkSet).mockRejectedValue(
        new Error('Codebase not found')
      );

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/codebases/non-existent/chunk-sets/2024-01-01T00:00:00Z',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 500 on service error', async () => {
      vi.mocked(mockCodebaseService.deleteChunkSet).mockRejectedValue(
        new Error('Database error')
      );

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/codebases/test-codebase/chunk-sets/2024-01-01T00:00:00Z',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
