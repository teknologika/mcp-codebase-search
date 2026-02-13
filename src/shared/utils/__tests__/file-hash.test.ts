/**
 * Tests for file hashing utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { calculateFileHash, calculateFileHashes } from '../file-hash.js';

const TEST_DIR = join(process.cwd(), '.test-file-hash');

describe('FileHash', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('calculateFileHash', () => {
    it('should calculate MD5 hash of a file', async () => {
      const filePath = join(TEST_DIR, 'test.txt');
      await writeFile(filePath, 'Hello, World!');

      const hash = await calculateFileHash(filePath);

      expect(hash).toBe('65a8e27d8879283831b664bd8b7f0ad4');
    });

    it('should return same hash for identical content', async () => {
      const file1 = join(TEST_DIR, 'file1.txt');
      const file2 = join(TEST_DIR, 'file2.txt');
      const content = 'Same content';

      await writeFile(file1, content);
      await writeFile(file2, content);

      const hash1 = await calculateFileHash(file1);
      const hash2 = await calculateFileHash(file2);

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', async () => {
      const file1 = join(TEST_DIR, 'file1.txt');
      const file2 = join(TEST_DIR, 'file2.txt');

      await writeFile(file1, 'Content A');
      await writeFile(file2, 'Content B');

      const hash1 = await calculateFileHash(file1);
      const hash2 = await calculateFileHash(file2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty files', async () => {
      const filePath = join(TEST_DIR, 'empty.txt');
      await writeFile(filePath, '');

      const hash = await calculateFileHash(filePath);

      expect(hash).toBe('d41d8cd98f00b204e9800998ecf8427e'); // MD5 of empty string
    });

    it('should handle large files', async () => {
      const filePath = join(TEST_DIR, 'large.txt');
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      await writeFile(filePath, largeContent);

      const hash = await calculateFileHash(filePath);

      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(32); // MD5 is 32 hex characters
    });

    it('should reject for non-existent file', async () => {
      const filePath = join(TEST_DIR, 'nonexistent.txt');

      await expect(calculateFileHash(filePath)).rejects.toThrow();
    });
  });

  describe('calculateFileHashes', () => {
    it('should calculate hashes for multiple files', async () => {
      const files = [
        join(TEST_DIR, 'file1.txt'),
        join(TEST_DIR, 'file2.txt'),
        join(TEST_DIR, 'file3.txt'),
      ];

      await writeFile(files[0], 'Content 1');
      await writeFile(files[1], 'Content 2');
      await writeFile(files[2], 'Content 3');

      const hashes = await calculateFileHashes(files);

      expect(hashes.size).toBe(3);
      expect(hashes.get(files[0])).toBeTruthy();
      expect(hashes.get(files[1])).toBeTruthy();
      expect(hashes.get(files[2])).toBeTruthy();
      
      // All hashes should be different
      const hashValues = Array.from(hashes.values());
      expect(new Set(hashValues).size).toBe(3);
    });

    it('should handle empty file list', async () => {
      const hashes = await calculateFileHashes([]);

      expect(hashes.size).toBe(0);
    });

    it('should skip files that fail to hash', async () => {
      const files = [
        join(TEST_DIR, 'exists.txt'),
        join(TEST_DIR, 'nonexistent.txt'),
      ];

      await writeFile(files[0], 'Content');

      const hashes = await calculateFileHashes(files);

      expect(hashes.size).toBe(1);
      expect(hashes.get(files[0])).toBeTruthy();
      expect(hashes.get(files[1])).toBeUndefined();
    });

    it('should respect concurrency limit', async () => {
      const files = Array.from({ length: 25 }, (_, i) => 
        join(TEST_DIR, `file${i}.txt`)
      );

      for (const file of files) {
        await writeFile(file, `Content ${file}`);
      }

      const hashes = await calculateFileHashes(files, 5);

      expect(hashes.size).toBe(25);
    });
  });
});
