/**
 * Manager UI routes with server-side rendering
 * Provides web interface for codebase management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CodebaseService } from '../../domains/codebase/codebase.service.js';
import type { SearchService } from '../../domains/search/search.service.js';
import { createLogger } from '../../shared/logging/index.js';

const rootLogger = createLogger('info');
const logger = rootLogger.child('ManagerRoutes');

/**
 * Register Manager UI routes
 */
export async function registerManagerRoutes(
  fastify: FastifyInstance,
  codebaseService: CodebaseService,
  searchService: SearchService
): Promise<void> {
  /**
   * GET /browse-folders
   * Browse filesystem folders (server-side)
   */
  fastify.get('/browse-folders', async (request: FastifyRequest, reply: FastifyReply) => {
    const { path: currentPath } = request.query as { path?: string };
    
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const os = await import('node:os');
      
      // Default to home directory if no path provided
      const browsePath = currentPath || os.homedir();
      
      // Read directory contents
      const entries = await fs.readdir(browsePath, { withFileTypes: true });
      
      // Filter to only directories and sort
      const directories = entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => ({
          name: entry.name,
          path: path.join(browsePath, entry.name)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      
      // Get parent directory
      const parentPath = path.dirname(browsePath);
      
      return reply.send({
        currentPath: browsePath,
        parentPath: parentPath !== browsePath ? parentPath : null,
        directories
      });
    } catch (error) {
      logger.error('Failed to browse folders', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        error: 'Failed to browse folders',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /
   * Main page - list codebases
   */
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.info('GET /');
      const codebases = await codebaseService.listCodebases();
      
      // Get flash messages using reply.flash()
      const flashMessages = (reply as any).flash();
      
      return reply.view('index.hbs', {
        title: 'Dashboard',
        codebases,
        message: flashMessages?.message?.[0],
        messageType: flashMessages?.messageType?.[0]
      });
    } catch (error) {
      logger.error('Failed to load codebases', error instanceof Error ? error : new Error(String(error)));
      return reply.view('index.hbs', {
        title: 'Dashboard',
        codebases: [],
        message: 'Failed to load codebases',
        messageType: 'error'
      });
    }
  });

  /**
   * GET /codebase/:name
   * View codebase details
   */
  fastify.get<{ Params: { name: string } }>(
    '/codebase/:name',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const { name } = request.params;
      
      try {
        logger.info('GET /codebase/:name', { name });
        const stats = await codebaseService.getCodebaseStats(name);
        const codebases = await codebaseService.listCodebases();
        
        return reply.view('index.hbs', {
          title: name,
          codebases,
          selectedCodebase: name,
          stats
        });
      } catch (error) {
        logger.error('Failed to load codebase', error instanceof Error ? error : new Error(String(error)), { name });
        (request as any).flash('message', `Failed to load codebase: ${error instanceof Error ? error.message : String(error)}`);
        (request as any).flash('messageType', 'error');
        return reply.redirect('/');
      }
    }
  );

  /**
   * POST /search
   * Search codebases
   */
  fastify.post('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query, maxResults = 10 } = request.body as { query: string; maxResults?: number };
    
    try {
      logger.info('POST /search', { query, maxResults });
      
      if (!query || query.trim() === '') {
        (request as any).flash('message', 'Search query is required');
        (request as any).flash('messageType', 'error');
        return reply.redirect('/');
      }
      
      const results = await searchService.search({
        query,
        maxResults: Number(maxResults)
      });
      
      const codebases = await codebaseService.listCodebases();
      
      return reply.view('index.hbs', {
        title: 'Search Results',
        codebases,
        searchResults: results.results,
        searchQuery: query,
        maxResults: Number(maxResults)
      });
    } catch (error) {
      logger.error('Search failed', error instanceof Error ? error : new Error(String(error)));
      (request as any).flash('message', `Search failed: ${error instanceof Error ? error.message : String(error)}`);
      (request as any).flash('messageType', 'error');
      return reply.redirect('/');
    }
  });

  /**
   * POST /ingest
   * Ingest new codebase
   */
  fastify.post('/ingest', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, path } = request.body as { name: string; path: string };
    
    try {
      logger.info('POST /ingest', { name, path });
      
      // Validation
      if (!name || !path) {
        (request as any).flash('message', 'Codebase name and path are required');
        (request as any).flash('messageType', 'error');
        return reply.redirect('/');
      }
      
      // Normalize name: spaces to hyphens, lowercase, alphanumeric only
      const normalizedName = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      if (!normalizedName) {
        (request as any).flash('message', 'Codebase name must contain at least one alphanumeric character');
        (request as any).flash('messageType', 'error');
        return reply.redirect('/');
      }
      
      // Note: Ingestion service needs to be injected
      // For now, show a message that ingestion is not yet implemented
      (request as any).flash('message', 'Ingestion feature coming soon - use CLI for now');
      (request as any).flash('messageType', 'warning');
      return reply.redirect('/');
      
    } catch (error) {
      logger.error('Ingestion failed', error instanceof Error ? error : new Error(String(error)), { name, path });
      (request as any).flash('message', `Ingestion failed: ${error instanceof Error ? error.message : String(error)}`);
      (request as any).flash('messageType', 'error');
      return reply.redirect('/');
    }
  });

  /**
   * POST /rename
   * Rename codebase
   */
  fastify.post('/rename', async (request: FastifyRequest, reply: FastifyReply) => {
    const { oldName, newName } = request.body as { oldName: string; newName: string };
    
    try {
      logger.info('POST /rename', { oldName, newName });
      
      if (!oldName || !newName) {
        (request as any).flash('message', 'Both old and new names are required');
        (request as any).flash('messageType', 'error');
        return reply.redirect('/');
      }
      
      // Normalize new name: spaces to hyphens, lowercase, alphanumeric only
      const normalizedNewName = newName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      if (!normalizedNewName) {
        (request as any).flash('message', 'New name must contain at least one alphanumeric character');
        (request as any).flash('messageType', 'error');
        return reply.redirect('/');
      }
      
      await codebaseService.renameCodebase(oldName, normalizedNewName);
      
      (request as any).flash('message', `Renamed ${oldName} to ${normalizedNewName}`);
      (request as any).flash('messageType', 'success');
      return reply.redirect('/');
    } catch (error) {
      logger.error('Rename failed', error instanceof Error ? error : new Error(String(error)), { oldName, newName });
      (request as any).flash('message', `Rename failed: ${error instanceof Error ? error.message : String(error)}`);
      (request as any).flash('messageType', 'error');
      return reply.redirect('/');
    }
  });

  /**
   * POST /delete
   * Delete codebase
   */
  fastify.post('/delete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.body as { name: string };
    
    try {
      logger.info('POST /delete', { name });
      
      if (!name) {
        (request as any).flash('message', 'Codebase name is required');
        (request as any).flash('messageType', 'error');
        return reply.redirect('/');
      }
      
      await codebaseService.deleteCodebase(name);
      
      (request as any).flash('message', `Deleted ${name}`);
      (request as any).flash('messageType', 'success');
      return reply.redirect('/');
    } catch (error) {
      logger.error('Delete failed', error instanceof Error ? error : new Error(String(error)), { name });
      (request as any).flash('message', `Delete failed: ${error instanceof Error ? error.message : String(error)}`);
      (request as any).flash('messageType', 'error');
      return reply.redirect('/');
    }
  });

  logger.info('Manager UI routes registered successfully');
}
