/**
 * Manager UI routes with server-side rendering
 * Provides web interface for codebase management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CodebaseService } from '../../domains/codebase/codebase.service.js';
import type { SearchService } from '../../domains/search/search.service.js';
import type { IngestionService } from '../../domains/ingestion/ingestion.service.js';
import type { Config } from '../../shared/types/index.js';
import { createLogger } from '../../shared/logging/index.js';
import { randomUUID } from 'node:crypto';

const rootLogger = createLogger('info');
const logger = rootLogger.child('ManagerRoutes');

/**
 * Ingestion job tracking
 */
interface IngestionJob {
  id: string;
  codebaseName: string;
  phase: string;
  current: number;
  total: number;
  status: 'running' | 'completed' | 'failed';
  error?: string;
}

const ingestionJobs = new Map<string, IngestionJob>();

/**
 * Register Manager UI routes
 */
export async function registerManagerRoutes(
  fastify: FastifyInstance,
  codebaseService: CodebaseService,
  searchService: SearchService,
  ingestionService: IngestionService,
  config: Config
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
      const codebases = await codebaseService.listCodebases();
      
      logger.debug('Codebases loaded', { count: codebases.length, codebases: codebases.map(c => ({ name: c.name, fileCount: c.fileCount, lastIngestion: c.lastIngestion })) });
      
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
    const { query, maxResults = 10, excludeTests, excludeLibraries } = request.body as { 
      query: string; 
      maxResults?: number;
      excludeTests?: string;
      excludeLibraries?: string;
    };
    
    try {
      logger.info('POST /search', { query, maxResults, excludeTests, excludeLibraries });
      
      if (!query || query.trim() === '') {
        (request as any).flash('message', 'Search query is required');
        (request as any).flash('messageType', 'error');
        return reply.redirect('/');
      }
      
      const results = await searchService.search({
        query,
        maxResults: Number(maxResults),
        excludeTests: excludeTests === 'true',
        excludeLibraries: excludeLibraries === 'true',
      });
      
      const codebases = await codebaseService.listCodebases();
      
      return reply.view('index.hbs', {
        title: 'Search Results',
        codebases,
        searchResults: results.results,
        searchQuery: query,
        maxResults: Number(maxResults),
        excludeTests: excludeTests === 'true',
        excludeLibraries: excludeLibraries === 'true',
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
   * Start codebase ingestion (returns job ID immediately)
   */
  fastify.post('/ingest', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, path, respectGitignore } = request.body as { name: string; path: string; respectGitignore?: string };
    
    try {
      logger.info('POST /ingest - received request', { name, path, respectGitignore, body: request.body });
      
      // Validation
      if (!name || !path) {
        logger.warn('POST /ingest - missing name or path', { name, path });
        return reply.status(400).send({
          error: 'Codebase name and path are required'
        });
      }
      
      // Normalize name: spaces to hyphens, lowercase, alphanumeric only
      const normalizedName = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      logger.info('POST /ingest - normalized name', { originalName: name, normalizedName });
      
      if (!normalizedName) {
        logger.warn('POST /ingest - normalized name is empty', { originalName: name });
        return reply.status(400).send({
          error: 'Codebase name must contain at least one alphanumeric character'
        });
      }
      
      // Verify path exists
      const fs = await import('node:fs/promises');
      try {
        const stats = await fs.stat(path);
        if (!stats.isDirectory()) {
          logger.warn('POST /ingest - path is not a directory', { path });
          return reply.status(400).send({
            error: 'Path must be a directory'
          });
        }
      } catch (error) {
        logger.warn('POST /ingest - path does not exist', { path, error: error instanceof Error ? error.message : String(error) });
        return reply.status(400).send({
          error: 'Path does not exist or is not accessible'
        });
      }
      
      // Create job ID
      const jobId = randomUUID();
      
      logger.info('POST /ingest - starting ingestion', { jobId, normalizedName, path, respectGitignore });
      
      // Initialize job tracking
      ingestionJobs.set(jobId, {
        id: jobId,
        codebaseName: normalizedName,
        phase: 'Starting',
        current: 0,
        total: 1,
        status: 'running'
      });
      
      // Start ingestion in background
      ingestionService.ingestCodebase(
        { 
          name: normalizedName, 
          path, 
          config,
          respectGitignore: respectGitignore === 'true'
        },
        (phase: string, current: number, total: number) => {
          const job = ingestionJobs.get(jobId);
          if (job) {
            job.phase = phase;
            job.current = current;
            job.total = total;
          }
        }
      ).then(() => {
        const job = ingestionJobs.get(jobId);
        if (job) {
          job.status = 'completed';
          job.phase = 'Complete';
          job.current = job.total;
        }
        logger.info('Ingestion completed', { jobId, codebaseName: normalizedName });
      }).catch((error) => {
        const job = ingestionJobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = error instanceof Error ? error.message : String(error);
        }
        logger.error('Ingestion failed', error instanceof Error ? error : new Error(String(error)), { jobId, codebaseName: normalizedName });
      });
      
      // Return job ID immediately
      logger.info('POST /ingest - returning job ID', { jobId });
      return reply.send({ jobId });
      
    } catch (error) {
      logger.error('Failed to start ingestion', error instanceof Error ? error : new Error(String(error)), { name, path });
      return reply.status(500).send({
        error: `Failed to start ingestion: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });

  /**
   * GET /ingest-progress/:jobId
   * Stream ingestion progress via Server-Sent Events
   */
  fastify.get<{ Params: { jobId: string } }>(
    '/ingest-progress/:jobId',
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const { jobId } = request.params;
      
      const job = ingestionJobs.get(jobId);
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }
      
      // Set up SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      
      // Send initial progress
      const sendProgress = () => {
        const currentJob = ingestionJobs.get(jobId);
        if (!currentJob) return false;
        
        const data = JSON.stringify({
          phase: currentJob.phase,
          current: currentJob.current,
          total: currentJob.total,
          status: currentJob.status,
          error: currentJob.error
        });
        
        reply.raw.write(`data: ${data}\n\n`);
        
        return currentJob.status === 'running';
      };
      
      // Send progress updates every 500ms
      const interval = setInterval(() => {
        const shouldContinue = sendProgress();
        if (!shouldContinue) {
          clearInterval(interval);
          // Clean up job after 5 seconds
          setTimeout(() => {
            ingestionJobs.delete(jobId);
            logger.info('Cleaned up ingestion job', { jobId });
          }, 5000);
          reply.raw.end();
        }
      }, 500);
      
      // Handle client disconnect
      request.raw.on('close', () => {
        clearInterval(interval);
        logger.info('Client disconnected from SSE', { jobId });
      });
    }
  );

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

  /**
   * GET /api/codebases/:name/files
   * List all files in a codebase
   */
  fastify.get<{ Params: { name: string } }>(
    '/api/codebases/:name/files',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const { name } = request.params;
      
      try {
        const files = await codebaseService.listFiles(name);
        return reply.send({ files });
      } catch (error) {
        logger.error('Failed to list files', error instanceof Error ? error : new Error(String(error)), { name });
        return reply.status(500).send({
          error: 'Failed to list files',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );

  /**
   * DELETE /api/codebases/:name/files
   * Delete a specific file from a codebase
   */
  fastify.delete<{ Params: { name: string }; Body: { filePath: string } }>(
    '/api/codebases/:name/files',
    async (request: FastifyRequest<{ Params: { name: string }; Body: { filePath: string } }>, reply: FastifyReply) => {
      const { name } = request.params;
      const { filePath } = request.body;
      
      try {
        if (!filePath) {
          return reply.status(400).send({
            error: 'File path is required'
          });
        }
        
        await codebaseService.deleteFile(name, filePath);
        
        // Clear search cache after deletion
        searchService.clearCache();
        
        return reply.send({ success: true });
      } catch (error) {
        logger.error('Failed to delete file', error instanceof Error ? error : new Error(String(error)), { name, filePath });
        return reply.status(500).send({
          error: 'Failed to delete file',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );

  logger.debug('Manager UI routes registered successfully');
}
