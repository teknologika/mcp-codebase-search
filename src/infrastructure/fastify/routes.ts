/**
 * HTTP API routes for the Fastify server
 * Provides REST endpoints for codebase management and search
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CodebaseService } from '../../domains/codebase/codebase.service.js';
import type { SearchService } from '../../domains/search/search.service.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createLogger } from '../../shared/logging/index.js';

const rootLogger = createLogger('info');
const logger = rootLogger.child('FastifyRoutes');

// Initialize AJV for schema validation
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

/**
 * Validation schemas for API endpoints
 */
const schemas = {
  search: {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1 },
      codebaseName: { type: 'string' },
      language: { type: 'string' },
      maxResults: { type: 'integer', minimum: 1, maximum: 1000 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  rename: {
    type: 'object',
    properties: {
      newName: { type: 'string', minLength: 1, maxLength: 255 },
    },
    required: ['newName'],
    additionalProperties: false,
  },
};

// Compile validators
const validateSearch = ajv.compile(schemas.search);
const validateRename = ajv.compile(schemas.rename);

/**
 * Error response format
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Create error response
 */
function createErrorResponse(
  code: string,
  message: string,
  details?: any
): ErrorResponse {
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}

/**
 * Register all API routes
 */
export async function registerRoutes(
  fastify: FastifyInstance,
  codebaseService: CodebaseService,
  searchService: SearchService
): Promise<void> {
  /**
   * GET /api/codebases
   * List all codebases with metadata
   */
  fastify.get('/api/codebases', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.info('GET /api/codebases');
      const codebases = await codebaseService.listCodebases();
      return { codebases };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to list codebases', error instanceof Error ? error : new Error(errorMessage));
      
      reply.status(500);
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Failed to list codebases',
        errorMessage
      );
    }
  });

  /**
   * POST /api/search
   * Search codebases with query and filters
   */
  fastify.post('/api/search', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.info('POST /api/search', { body: request.body });

      // Validate request body
      if (!validateSearch(request.body)) {
        reply.status(400);
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Invalid search parameters',
          validateSearch.errors
        );
      }

      const params = request.body as {
        query: string;
        codebaseName?: string;
        language?: string;
        maxResults?: number;
      };

      const results = await searchService.search(params);
      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Search failed', error instanceof Error ? error : new Error(errorMessage));
      
      reply.status(500);
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Search operation failed',
        errorMessage
      );
    }
  });

  /**
   * GET /api/codebases/:name/stats
   * Get detailed statistics for a codebase
   */
  fastify.get<{ Params: { name: string } }>(
    '/api/codebases/:name/stats',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      try {
        const { name } = request.params;
        logger.info('GET /api/codebases/:name/stats', { name });

        if (!name || name.trim() === '') {
          reply.status(400);
          return createErrorResponse(
            'VALIDATION_ERROR',
            'Codebase name is required'
          );
        }

        const stats = await codebaseService.getCodebaseStats(name);
        return stats;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if it's a not found error
        if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
          logger.warn('Codebase not found', { name: request.params.name });
          reply.status(404);
          return createErrorResponse(
            'NOT_FOUND',
            `Codebase '${request.params.name}' not found`
          );
        }

        logger.error('Failed to get codebase stats', error instanceof Error ? error : new Error(errorMessage));
        reply.status(500);
        return createErrorResponse(
          'INTERNAL_ERROR',
          'Failed to get codebase statistics',
          errorMessage
        );
      }
    }
  );

  /**
   * PUT /api/codebases/:name
   * Rename a codebase
   */
  fastify.put<{ Params: { name: string } }>(
    '/api/codebases/:name',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      try {
        const { name } = request.params;
        logger.info('PUT /api/codebases/:name', { name, body: request.body });

        if (!name || name.trim() === '') {
          reply.status(400);
          return createErrorResponse(
            'VALIDATION_ERROR',
            'Codebase name is required'
          );
        }

        // Validate request body
        if (!validateRename(request.body)) {
          reply.status(400);
          return createErrorResponse(
            'VALIDATION_ERROR',
            'Invalid rename parameters',
            validateRename.errors
          );
        }

        const { newName } = request.body as { newName: string };

        await codebaseService.renameCodebase(name, newName);
        
        return {
          success: true,
          message: `Codebase '${name}' renamed to '${newName}'`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if it's a not found error
        if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
          logger.warn('Codebase not found', { name: request.params.name });
          reply.status(404);
          return createErrorResponse(
            'NOT_FOUND',
            `Codebase '${request.params.name}' not found`
          );
        }

        logger.error('Failed to rename codebase', error instanceof Error ? error : new Error(errorMessage));
        reply.status(500);
        return createErrorResponse(
          'INTERNAL_ERROR',
          'Failed to rename codebase',
          errorMessage
        );
      }
    }
  );

  /**
   * DELETE /api/codebases/:name
   * Delete a codebase and all its chunks
   */
  fastify.delete<{ Params: { name: string } }>(
    '/api/codebases/:name',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      try {
        const { name } = request.params;
        logger.info('DELETE /api/codebases/:name', { name });

        if (!name || name.trim() === '') {
          reply.status(400);
          return createErrorResponse(
            'VALIDATION_ERROR',
            'Codebase name is required'
          );
        }

        await codebaseService.deleteCodebase(name);
        
        return {
          success: true,
          message: `Codebase '${name}' deleted successfully`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if it's a not found error
        if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
          logger.warn('Codebase not found', { name: request.params.name });
          reply.status(404);
          return createErrorResponse(
            'NOT_FOUND',
            `Codebase '${request.params.name}' not found`
          );
        }

        logger.error('Failed to delete codebase', error instanceof Error ? error : new Error(errorMessage));
        reply.status(500);
        return createErrorResponse(
          'INTERNAL_ERROR',
          'Failed to delete codebase',
          errorMessage
        );
      }
    }
  );

  /**
   * DELETE /api/codebases/:name/chunk-sets/:timestamp
   * Delete chunks from a specific ingestion timestamp
   */
  fastify.delete<{ Params: { name: string; timestamp: string } }>(
    '/api/codebases/:name/chunk-sets/:timestamp',
    async (
      request: FastifyRequest<{ Params: { name: string; timestamp: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, timestamp } = request.params;
        logger.info('DELETE /api/codebases/:name/chunk-sets/:timestamp', {
          name,
          timestamp,
        });

        if (!name || name.trim() === '') {
          reply.status(400);
          return createErrorResponse(
            'VALIDATION_ERROR',
            'Codebase name is required'
          );
        }

        if (!timestamp || timestamp.trim() === '') {
          reply.status(400);
          return createErrorResponse(
            'VALIDATION_ERROR',
            'Timestamp is required'
          );
        }

        const chunksDeleted = await codebaseService.deleteChunkSet(name, timestamp);
        
        return {
          success: true,
          chunksDeleted,
          message: `Deleted ${chunksDeleted} chunks from codebase '${name}' at timestamp '${timestamp}'`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if it's a not found error
        if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
          logger.warn('Codebase not found', { name: request.params.name });
          reply.status(404);
          return createErrorResponse(
            'NOT_FOUND',
            `Codebase '${request.params.name}' not found`
          );
        }

        logger.error('Failed to delete chunk set', error instanceof Error ? error : new Error(errorMessage));
        reply.status(500);
        return createErrorResponse(
          'INTERNAL_ERROR',
          'Failed to delete chunk set',
          errorMessage
        );
      }
    }
  );

  logger.info('API routes registered successfully');
}
