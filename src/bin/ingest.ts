#!/usr/bin/env node

/**
 * Ingestion CLI Entry Point
 * 
 * Command-line interface for ingesting codebases into the semantic search system.
 * 
 * Usage:
 *   ingest --path <directory> --name <codebase-name> [--config <config-file>]
 * 
 * Requirements: 9.2, 9.4
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../shared/config/config.js';
import { createLogger } from '../shared/logging/logger.js';
import { IngestionService } from '../domains/ingestion/ingestion.service.js';
import { createEmbeddingService } from '../domains/embedding/embedding.service.js';
import { ChromaDBClientWrapper } from '../infrastructure/chromadb/chromadb.client.js';

/**
 * Format duration in seconds
 */
function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}



/**
 * Create a simple progress bar
 */
function createProgressBar(phase: string, current: number, total: number): string {
  const percentage = Math.floor((current / total) * 100);
  const barLength = 40;
  const filledLength = Math.floor((current / total) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  return `${phase}: [${bar}] ${percentage}% (${current}/${total})`;
}

/**
 * Main CLI function
 */
async function main() {
  const program = new Command();

  program
    .name('ingest')
    .description('Ingest a codebase for semantic search')
    .version('0.1.0')
    .requiredOption('-p, --path <directory>', 'Path to codebase directory')
    .requiredOption('-n, --name <name>', 'Unique name for the codebase')
    .option('-c, --config <file>', 'Path to configuration file')
    .parse(process.argv);

  const options = program.opts();

  try {
    // Validate required arguments
    if (!options.path) {
      console.error('Error: --path is required');
      process.exit(1);
    }

    if (!options.name) {
      console.error('Error: --name is required');
      process.exit(1);
    }

    // Resolve and validate path
    const codebasePath = resolve(options.path);
    if (!existsSync(codebasePath)) {
      console.error(`Error: Directory not found: ${codebasePath}`);
      process.exit(1);
    }

    // Load configuration
    const config = loadConfig(options.config);
    const logger = createLogger(config.logging.level);

    console.log(`\nIngesting codebase: ${options.name}`);
    console.log(`Path: ${codebasePath}`);
    console.log('');

    // Initialize services
    logger.info('Initializing services...');

    const chromaClient = new ChromaDBClientWrapper(config);
    await chromaClient.initialize();

    const embeddingService = createEmbeddingService(config, logger);
    await embeddingService.initialize();

    const ingestionService = new IngestionService(
      embeddingService,
      chromaClient,
      config
    );

    // Track progress
    let lastPhase = '';
    let lastProgress = '';

    const progressCallback = (phase: string, current: number, total: number) => {
      const progressBar = createProgressBar(phase, current, total);
      
      // Clear previous line if same phase
      if (phase === lastPhase && lastProgress) {
        process.stdout.write('\r\x1b[K');
      } else if (lastPhase && phase !== lastPhase) {
        // New phase, print newline
        console.log('');
      }
      
      process.stdout.write(progressBar);
      lastPhase = phase;
      lastProgress = progressBar;
      
      // Print newline when complete
      if (current === total) {
        console.log('');
      }
    };

    // Run ingestion
    const stats = await ingestionService.ingestCodebase(
      {
        path: codebasePath,
        name: options.name,
        config,
      },
      progressCallback
    );

    // Print statistics
    console.log('');
    console.log('✓ Ingestion completed successfully!');
    console.log('');
    console.log('Statistics:');
    console.log(`  Total files scanned: ${stats.totalFiles}`);
    console.log(`  Supported files: ${stats.supportedFiles}`);
    console.log(`  Unsupported files: ${stats.unsupportedFiles}`);
    console.log(`  Chunks created: ${stats.chunksCreated}`);
    console.log(`  Duration: ${formatDuration(stats.durationMs)}`);
    console.log('');

    // Print language distribution
    if (stats.languages.size > 0) {
      console.log('Languages detected:');
      const sortedLanguages = Array.from(stats.languages.values()).sort(
        (a, b) => b.chunkCount - a.chunkCount
      );
      for (const lang of sortedLanguages) {
        console.log(
          `  ${lang.language}: ${lang.chunkCount} chunks (${lang.fileCount} files)`
        );
      }
      console.log('');
    }

    // Print unsupported file summary
    if (stats.unsupportedFiles.size > 0) {
      console.log('Unsupported files by extension:');
      const sortedExtensions = Array.from(stats.unsupportedFiles.entries()).sort(
        (a, b) => b[1] - a[1]
      );
      for (const [ext, count] of sortedExtensions) {
        console.log(`  ${ext}: ${count} files`);
      }
      console.log('');
    }

    logger.info('Ingestion completed', {
      codebaseName: options.name,
      ...stats,
    });

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('✗ Ingestion failed');
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

// Run the CLI
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
