#!/usr/bin/env node
/**
 * Manager UI Entry Point
 * 
 * Starts the Fastify server with the web-based Manager UI for codebase management.
 * 
 * Usage:
 *   manager [--config <path>]
 * 
 * Environment Variables:
 *   CONFIG_PATH - Path to configuration file
 * 
 * Validates: Requirements 9.2, 9.5
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../shared/config/index.js';
import { createLogger } from '../shared/logging/index.js';
import { LanceDBClientWrapper } from '../infrastructure/lancedb/lancedb.client.js';
import { HuggingFaceEmbeddingService } from '../domains/embedding/index.js';
import { CodebaseService } from '../domains/codebase/codebase.service.js';
import { SearchService } from '../domains/search/search.service.js';
import { IngestionService } from '../domains/ingestion/ingestion.service.js';
import { FastifyServer } from '../infrastructure/fastify/fastify-server.js';

const execAsync = promisify(exec);

/**
 * Check if a port is in use
 */
async function isPortInUse(port: number, host: string): Promise<boolean> {
  const net = await import('node:net');
  
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    
    server.listen(port, host);
  });
}

/**
 * Try to shutdown existing server
 */
async function shutdownExistingServer(host: string, port: number): Promise<boolean> {
  try {
    const url = `http://${host}:${port}/api/shutdown`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    
    if (response.ok) {
      // Wait for server to shut down
      await new Promise(resolve => setTimeout(resolve, 1500));
      return true;
    }
    return false;
  } catch (error) {
    // Server might not have the shutdown endpoint or is not responding
    return false;
  }
}

/**
 * Wait for port to become available
 */
async function waitForPort(port: number, host: string, maxAttempts: number = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const inUse = await isPortInUse(port, host);
    if (!inUse) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

// Parse command line arguments
const args = process.argv.slice(2);
let configPath: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' && i + 1 < args.length) {
    configPath = args[i + 1];
    i++;
  }
}

// Use environment variable if not provided via CLI
if (!configPath && process.env.CONFIG_PATH) {
  configPath = process.env.CONFIG_PATH;
}

/**
 * Open URL in default browser
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  try {
    await execAsync(command);
  } catch (error: unknown) {
    throw new Error(
      `Failed to open browser: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Main function to start the Manager UI server
 */
async function main() {
  // Initialize logger with 'warn' level to reduce noise
  let logger = createLogger('warn');
  let mainLogger = logger.child('main');

  try {
    // Load configuration
    const config = loadConfig(configPath);

    // Override log level to 'warn' for manager to reduce noise
    config.logging.level = 'warn';

    // Re-initialize logger with configured level
    logger = createLogger(config.logging.level);
    mainLogger = logger.child('main');

    mainLogger.debug('Initializing Manager UI server', {
      configPath: configPath || 'default',
      schemaVersion: config.schemaVersion,
    });

    // Initialize LanceDB client
    mainLogger.debug('Initializing LanceDB client', {
      persistPath: config.lancedb.persistPath,
    });
    const lanceClient = new LanceDBClientWrapper(config);
    await lanceClient.initialize();

    // Initialize embedding service
    mainLogger.debug('Initializing embedding service', {
      modelName: config.embedding.modelName,
    });
    const embeddingService = new HuggingFaceEmbeddingService(config, logger);
    await embeddingService.initialize();

    // Initialize codebase service
    mainLogger.debug('Initializing codebase service');
    const codebaseService = new CodebaseService(lanceClient, config);

    // Initialize search service
    mainLogger.debug('Initializing search service');
    const searchService = new SearchService(
      lanceClient,
      embeddingService,
      config
    );

    // Initialize ingestion service
    mainLogger.debug('Initializing ingestion service');
    const ingestionService = new IngestionService(
      embeddingService,
      lanceClient,
      config
    );

    // Create Fastify server
    const fastifyServer = new FastifyServer(
      codebaseService,
      searchService,
      ingestionService,
      config
    );

    // Check if port is already in use
    const portInUse = await isPortInUse(config.server.port, config.server.host);
    if (portInUse) {
      mainLogger.info('Port is already in use, attempting to shutdown existing server', {
        host: config.server.host,
        port: config.server.port,
      });
      console.log('');
      console.log('⚠ Port is already in use. Attempting to restart existing server...');
      console.log('');
      
      const shutdownSuccess = await shutdownExistingServer(config.server.host, config.server.port);
      if (shutdownSuccess) {
        mainLogger.info('Successfully requested shutdown of existing server');
        console.log('✓ Existing server shutdown requested');
        console.log('');
        
        // Wait for port to become available
        const portAvailable = await waitForPort(config.server.port, config.server.host);
        if (!portAvailable) {
          throw new Error(
            `Port ${config.server.port} is still in use after shutdown attempt. ` +
            `Please manually stop the process using port ${config.server.port}.`
          );
        }
        
        mainLogger.info('Port is now available');
        console.log('✓ Port is now available');
        console.log('');
      } else {
        throw new Error(
          `Port ${config.server.port} is already in use and could not be freed. ` +
          `Please manually stop the process using port ${config.server.port} or use a different port.`
        );
      }
    }

    // Setup graceful shutdown
    const shutdown = async (signal: string) => {
      mainLogger.info('Received shutdown signal', { signal });
      try {
        await fastifyServer.stop();
        process.exit(0);
      } catch (error) {
        mainLogger.error(
          'Error during shutdown',
          error instanceof Error ? error : new Error(String(error))
        );
        process.exit(1);
      }
    };

    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    // Start the server
    await fastifyServer.start();

    const serverUrl = fastifyServer.getUrl();
    mainLogger.info('Manager UI server is running', {
      url: serverUrl,
      host: config.server.host,
      port: config.server.port,
    });

    // Open browser to the Manager UI
    try {
      mainLogger.info('Opening browser to Manager UI', { url: serverUrl });
      await openBrowser(serverUrl);
      mainLogger.info('Browser opened successfully');
    } catch (error) {
      mainLogger.warn('Failed to open browser automatically', {
        url: serverUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log('');
      console.log('Manager UI is available at:', serverUrl);
      console.log('Please open this URL in your browser manually.');
      console.log('');
    }

    // Keep the process running
    console.log('');
    console.log('Manager UI server is running');
    console.log(`URL: ${serverUrl}`);
    console.log('Press Ctrl+C to stop');
    console.log('');
  } catch (error) {
    const errorLogger = logger.child('main');
    errorLogger.error(
      'Failed to start Manager UI server',
      error instanceof Error ? error : new Error(String(error))
    );

    console.error('');
    console.error('✗ Failed to start Manager UI server');
    console.error('');

    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);

      // Print stack trace in debug mode
      if (process.env.DEBUG) {
        console.error('');
        console.error('Stack trace:');
        console.error(error.stack);
      }
    } else {
      console.error(`Error: ${String(error)}`);
    }

    console.error('');
    console.error('Tip: Set DEBUG=1 for detailed error information');
    console.error('');

    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
