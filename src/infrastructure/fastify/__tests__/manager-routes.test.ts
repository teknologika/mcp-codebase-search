/**
 * Unit tests for Fastify manager routes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerManagerRoutes } from '../manager-routes.js';
import type { CodebaseService } from '../../../domains/codebase/codebase.service.js';
import type { SearchService } from '../../../domains/search/search.service.js';
import type { IngestionService } from '../../../domains/ingestion/ingestion.service.js';
import { DEFAULT_CONFIG } from '../../../shared/config/config.js';

describe('Fastify Manager Routes', () => {
  let fastify: FastifyInstance;
  let mockCodebaseService: CodebaseService;
  let mockSearchService: SearchService;
  let mockIngestionService: IngestionService;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    fastify.addHook('onRequest', async (request) => {
      (request as any).flash = vi.fn();
    });

    mockCodebaseService = {
      listCodebases: vi.fn().mockResolvedValue([]),
      getCodebaseStats: vi.fn(),
      renameCodebase: vi.fn(),
      deleteCodebase: vi.fn(),
      deleteChunkSet: vi.fn(),
      listFiles: vi.fn(),
      deleteFile: vi.fn(),
      getCodebasePath: vi.fn(),
    } as any;

    mockSearchService = {
      search: vi.fn().mockResolvedValue({
        results: [],
        totalResults: 0,
        queryTime: 1,
      }),
      clearCache: vi.fn(),
      getCacheStats: vi.fn(),
    } as any;

    mockIngestionService = {
      ingestCodebase: vi.fn(),
      rescanCodebase: vi.fn(),
    } as any;

    await registerManagerRoutes(
      fastify,
      mockCodebaseService,
      mockSearchService,
      mockIngestionService,
      DEFAULT_CONFIG
    );
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('Manager actions', () => {
    it('should rename a codebase and redirect on valid form submission', async () => {
      vi.mocked(mockCodebaseService.renameCodebase).mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'POST',
        url: '/rename',
        payload: {
          oldName: 'old-project',
          newName: 'New Project',
        },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/');
      expect(mockCodebaseService.renameCodebase).toHaveBeenCalledWith('old-project', 'new-project');
    });

    it('should delete a codebase and redirect on valid form submission', async () => {
      vi.mocked(mockCodebaseService.deleteCodebase).mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'POST',
        url: '/delete',
        payload: {
          name: 'test-project',
        },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/');
      expect(mockCodebaseService.deleteCodebase).toHaveBeenCalledWith('test-project');
    });
  });
});
