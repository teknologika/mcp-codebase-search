/**
 * File hashing utilities for change detection
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createLogger } from '../logging/index.js';

const rootLogger = createLogger('info');
const logger = rootLogger.child('FileHash');

/**
 * Calculate MD5 hash of a file
 * Uses streaming to handle large files efficiently
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      const digest = hash.digest('hex');
      logger.debug('File hash calculated', { filePath, hash: digest });
      resolve(digest);
    });

    stream.on('error', (error) => {
      logger.error('Failed to calculate file hash', error, { filePath });
      reject(error);
    });
  });
}

/**
 * Calculate hashes for multiple files in parallel
 */
export async function calculateFileHashes(
  filePaths: string[],
  concurrency: number = 10
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const batches: string[][] = [];

  // Split into batches
  for (let i = 0; i < filePaths.length; i += concurrency) {
    batches.push(filePaths.slice(i, i + concurrency));
  }

  // Process batches sequentially, files within batch in parallel
  for (const batch of batches) {
    const promises = batch.map(async (filePath) => {
      try {
        const hash = await calculateFileHash(filePath);
        return { filePath, hash };
      } catch (error) {
        logger.warn('Failed to hash file, skipping', { filePath, error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    });

    const batchResults = await Promise.all(promises);
    
    for (const result of batchResults) {
      if (result) {
        results.set(result.filePath, result.hash);
      }
    }
  }

  logger.info('File hashes calculated', { totalFiles: results.size });
  return results;
}
