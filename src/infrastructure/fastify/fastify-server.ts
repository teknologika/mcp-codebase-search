/**
 * Fastify server for the Manager UI and HTTP API
 * Provides web interface and REST endpoints for codebase management
 */

import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import fastifySession from '@fastify/session';
import fastifyFlash from '@fastify/flash';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import handlebars from 'handlebars';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { CodebaseService } from '../../domains/codebase/codebase.service.js';
import type { SearchService } from '../../domains/search/search.service.js';
import type { Config } from '../../shared/types/index.js';
import { registerRoutes } from './routes.js';
import { registerManagerRoutes } from './manager-routes.js';
import { createLogger } from '../../shared/logging/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootLogger = createLogger('info');
const logger = rootLogger.child('FastifyServer');

/**
 * Error thrown when Fastify server operations fail
 */
export class FastifyServerError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'FastifyServerError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Fastify server wrapper
 */
export class FastifyServer {
  private fastify: FastifyInstance;
  private config: Config;
  private codebaseService: CodebaseService;
  private searchService: SearchService;
  private isRunning = false;

  constructor(
    codebaseService: CodebaseService,
    searchService: SearchService,
    config: Config
  ) {
    this.codebaseService = codebaseService;
    this.searchService = searchService;
    this.config = config;

    // Create Fastify instance with Pino logger
    this.fastify = Fastify({
      logger: {
        level: config.logging.level,
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            headers: req.headers,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    });

    this.setupServer();
  }

  /**
   * Set up server middleware and routes
   */
  private setupServer(): void {
    // Register security headers with Helmet - relaxed for localhost development
    this.fastify.register(helmet, {
      contentSecurityPolicy: false, // Disable CSP entirely for localhost
      hsts: false, // Disable HSTS to avoid Safari issues with localhost
    });

    // Register form body parser (for POST forms)
    this.fastify.register(fastifyFormbody);

    // Register cookie support (required for session)
    this.fastify.register(fastifyCookie);

    // Register session support (required for flash messages)
    this.fastify.register(fastifySession, {
      secret: this.config.server.sessionSecret || 'change-me-in-production-please-use-a-long-random-string',
      cookie: {
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    });

    // Register flash messages
    this.fastify.register(fastifyFlash);

    // Register static file serving for UI assets
    const staticPath = join(__dirname, '../../ui/manager/static');
    this.fastify.register(fastifyStatic, {
      root: staticPath,
      prefix: '/static/',
    });

    // Register view engine with Handlebars
    const templatesPath = join(__dirname, '../../ui/manager/templates');
    this.fastify.register(fastifyView, {
      engine: {
        handlebars,
      },
      root: templatesPath,
      layout: 'layout.hbs',
      options: {
        partials: {},
      },
    });

    // Register Handlebars helpers
    handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    handlebars.registerHelper('toFixed', (value: number, decimals: number) => value.toFixed(decimals));
    handlebars.registerHelper('urlEncode', (value: string) => encodeURIComponent(value));
    handlebars.registerHelper('displayName', (name: string) => {
      // Convert hyphens/underscores to spaces and title case
      return name
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    });

    // Add global error handler
    this.fastify.setErrorHandler((error, request, reply) => {
      logger.error('Unhandled error', error instanceof Error ? error : new Error(String(error)), {
        method: request.method,
        url: request.url,
      });

      reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    });

    // Register Manager UI routes (SSR)
    this.fastify.register(async (instance) => {
      await registerManagerRoutes(instance, this.codebaseService, this.searchService);
    });

    // Register API routes
    this.fastify.register(async (instance) => {
      await registerRoutes(instance, this.codebaseService, this.searchService);
    });

    // Health check endpoint
    this.fastify.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    });

    logger.info('Fastify server configured', { staticPath, templatesPath });
  }

  /**
   * Start the Fastify server
   */
  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        logger.warn('Server is already running');
        return;
      }

      const { host, port } = this.config.server;

      await this.fastify.listen({
        host,
        port,
      });

      this.isRunning = true;

      logger.info('Fastify server started', {
        host,
        port,
        url: `http://${host}:${port}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to start Fastify server', error instanceof Error ? error : new Error(errorMessage));
      throw new FastifyServerError(
        `Failed to start server: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Stop the Fastify server
   */
  async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        logger.warn('Server is not running');
        return;
      }

      await this.fastify.close();
      this.isRunning = false;

      logger.info('Fastify server stopped');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to stop Fastify server', error instanceof Error ? error : new Error(errorMessage));
      throw new FastifyServerError(
        `Failed to stop server: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get the server URL
   */
  getUrl(): string {
    const { host, port } = this.config.server;
    return `http://${host}:${port}`;
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the Fastify instance (for testing)
   */
  getInstance(): FastifyInstance {
    return this.fastify;
  }
}
