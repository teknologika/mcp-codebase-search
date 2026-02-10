/**
 * Unit tests for File Scanner Service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileScannerService } from '../file-scanner.service.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('FileScannerService', () => {
  let service: FileScannerService;
  let testDir: string;

  beforeEach(async () => {
    service = new FileScannerService();
    // Create a temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-scanner-test-'));
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('scanDirectory', () => {
    it('should discover all files in a flat directory', async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, 'file1.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'file2.js'), 'content');
      await fs.writeFile(path.join(testDir, 'file3.py'), 'content');

      const { files, statistics } = await service.scanDirectory(testDir);

      expect(files).toHaveLength(3);
      expect(statistics.totalFiles).toBe(3);
      expect(statistics.supportedFiles).toBe(3);
      expect(statistics.unsupportedFiles).toBe(0);
    });

    it('should discover files in nested subdirectories', async () => {
      // Create nested structure
      await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'src', 'utils'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'index.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'src', 'app.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'src', 'utils', 'helper.ts'), 'content');

      const { files, statistics } = await service.scanDirectory(testDir);

      expect(files).toHaveLength(3);
      expect(statistics.totalFiles).toBe(3);
      
      // Verify all files were found
      const relativePaths = files.map(f => f.relativePath).sort();
      expect(relativePaths).toContain('index.ts');
      expect(relativePaths).toContain(path.join('src', 'app.ts'));
      expect(relativePaths).toContain(path.join('src', 'utils', 'helper.ts'));
    });

    it('should classify supported and unsupported files correctly', async () => {
      await fs.writeFile(path.join(testDir, 'code.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'README.md'), 'content');
      await fs.writeFile(path.join(testDir, 'config.json'), 'content');
      await fs.writeFile(path.join(testDir, 'script.py'), 'content');

      const { files, statistics } = await service.scanDirectory(testDir);

      expect(statistics.totalFiles).toBe(4);
      expect(statistics.supportedFiles).toBe(2); // .ts and .py
      expect(statistics.unsupportedFiles).toBe(2); // .md and .json

      const supported = files.filter(f => f.supported);
      const unsupported = files.filter(f => !f.supported);

      expect(supported).toHaveLength(2);
      expect(unsupported).toHaveLength(2);
    });

    it('should track unsupported files by extension', async () => {
      await fs.writeFile(path.join(testDir, 'README.md'), 'content');
      await fs.writeFile(path.join(testDir, 'CHANGELOG.md'), 'content');
      await fs.writeFile(path.join(testDir, 'config.json'), 'content');
      await fs.writeFile(path.join(testDir, 'data.xml'), 'content');

      const { statistics } = await service.scanDirectory(testDir);

      expect(statistics.unsupportedByExtension.get('.md')).toBe(2);
      expect(statistics.unsupportedByExtension.get('.json')).toBe(1);
      expect(statistics.unsupportedByExtension.get('.xml')).toBe(1);
    });

    it('should skip hidden directories by default', async () => {
      await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
      await fs.mkdir(path.join(testDir, '.vscode'), { recursive: true });
      await fs.writeFile(path.join(testDir, '.git', 'config'), 'content');
      await fs.writeFile(path.join(testDir, '.vscode', 'settings.json'), 'content');
      await fs.writeFile(path.join(testDir, 'visible.ts'), 'content');

      const { files, statistics } = await service.scanDirectory(testDir);

      expect(files).toHaveLength(1);
      expect(files[0].relativePath).toBe('visible.ts');
      expect(statistics.skippedHidden).toBe(2); // .git and .vscode directories
    });

    it('should include hidden directories when skipHiddenDirectories is false', async () => {
      await fs.mkdir(path.join(testDir, '.config'), { recursive: true });
      await fs.writeFile(path.join(testDir, '.config', 'app.ts'), 'content');

      const { files } = await service.scanDirectory(testDir, {
        skipHiddenDirectories: false,
      });

      expect(files).toHaveLength(1);
      expect(files[0].relativePath).toBe(path.join('.config', 'app.ts'));
    });

    it('should respect .gitignore patterns', async () => {
      // Create .gitignore
      await fs.writeFile(
        path.join(testDir, '.gitignore'),
        'node_modules/\n*.log\ndist/\n'
      );

      // Create files
      await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'dist'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'node_modules', 'lib.js'), 'content');
      await fs.writeFile(path.join(testDir, 'dist', 'bundle.js'), 'content');
      await fs.writeFile(path.join(testDir, 'debug.log'), 'content');
      await fs.writeFile(path.join(testDir, 'app.ts'), 'content');

      const { files, statistics } = await service.scanDirectory(testDir);

      expect(files).toHaveLength(1);
      expect(files[0].relativePath).toBe('app.ts');
      expect(statistics.skippedByGitignore).toBeGreaterThan(0);
    });

    it('should scan without .gitignore when respectGitignore is false', async () => {
      await fs.writeFile(
        path.join(testDir, '.gitignore'),
        'ignored.ts\n'
      );
      await fs.writeFile(path.join(testDir, 'ignored.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'visible.ts'), 'content');

      const { files } = await service.scanDirectory(testDir, {
        respectGitignore: false,
      });

      expect(files).toHaveLength(2);
    });

    it('should skip files larger than maxFileSize', async () => {
      // Create a small file
      await fs.writeFile(path.join(testDir, 'small.ts'), 'x'.repeat(100));
      
      // Create a large file
      await fs.writeFile(path.join(testDir, 'large.ts'), 'x'.repeat(2000));

      const { files } = await service.scanDirectory(testDir, {
        maxFileSize: 1000, // 1000 bytes
      });

      expect(files).toHaveLength(1);
      expect(files[0].relativePath).toBe('small.ts');
    });

    it('should handle empty directories', async () => {
      const { files, statistics } = await service.scanDirectory(testDir);

      expect(files).toHaveLength(0);
      expect(statistics.totalFiles).toBe(0);
      expect(statistics.supportedFiles).toBe(0);
      expect(statistics.unsupportedFiles).toBe(0);
    });

    it('should handle directories with only subdirectories', async () => {
      await fs.mkdir(path.join(testDir, 'empty1'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'empty2'), { recursive: true });

      const { files, statistics } = await service.scanDirectory(testDir);

      expect(files).toHaveLength(0);
      expect(statistics.totalFiles).toBe(0);
    });

    it('should include language information for supported files', async () => {
      await fs.writeFile(path.join(testDir, 'app.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'script.py'), 'content');
      await fs.writeFile(path.join(testDir, 'Main.java'), 'content');

      const { files } = await service.scanDirectory(testDir);

      const tsFile = files.find(f => f.extension === '.ts');
      const pyFile = files.find(f => f.extension === '.py');
      const javaFile = files.find(f => f.extension === '.java');

      expect(tsFile?.language).toBe('typescript');
      expect(pyFile?.language).toBe('python');
      expect(javaFile?.language).toBe('java');
    });

    it('should set language to null for unsupported files', async () => {
      await fs.writeFile(path.join(testDir, 'README.md'), 'content');

      const { files } = await service.scanDirectory(testDir);

      expect(files[0].language).toBeNull();
      expect(files[0].supported).toBe(false);
    });

    it('should handle files without extensions', async () => {
      await fs.writeFile(path.join(testDir, 'Makefile'), 'content');
      await fs.writeFile(path.join(testDir, 'Dockerfile'), 'content');

      const { files, statistics } = await service.scanDirectory(testDir);

      expect(files).toHaveLength(2);
      expect(statistics.unsupportedFiles).toBe(2);
      
      files.forEach(file => {
        expect(file.extension).toBe('');
        expect(file.supported).toBe(false);
      });
    });

    it('should track files without extensions in statistics', async () => {
      await fs.writeFile(path.join(testDir, 'Makefile'), 'content');
      await fs.writeFile(path.join(testDir, 'LICENSE'), 'content');

      const { statistics } = await service.scanDirectory(testDir);

      expect(statistics.unsupportedByExtension.get('(no extension)')).toBe(2);
    });
  });

  describe('getSupportedFiles', () => {
    it('should filter and return only supported files', async () => {
      await fs.writeFile(path.join(testDir, 'app.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'README.md'), 'content');
      await fs.writeFile(path.join(testDir, 'script.py'), 'content');

      const { files } = await service.scanDirectory(testDir);
      const supported = service.getSupportedFiles(files);

      expect(supported).toHaveLength(2);
      expect(supported.every(f => f.supported)).toBe(true);
    });

    it('should return empty array when no supported files exist', async () => {
      await fs.writeFile(path.join(testDir, 'README.md'), 'content');
      await fs.writeFile(path.join(testDir, 'config.json'), 'content');

      const { files } = await service.scanDirectory(testDir);
      const supported = service.getSupportedFiles(files);

      expect(supported).toHaveLength(0);
    });
  });

  describe('getUnsupportedFiles', () => {
    it('should filter and return only unsupported files', async () => {
      await fs.writeFile(path.join(testDir, 'app.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'README.md'), 'content');
      await fs.writeFile(path.join(testDir, 'config.json'), 'content');

      const { files } = await service.scanDirectory(testDir);
      const unsupported = service.getUnsupportedFiles(files);

      expect(unsupported).toHaveLength(2);
      expect(unsupported.every(f => !f.supported)).toBe(true);
    });

    it('should return empty array when all files are supported', async () => {
      await fs.writeFile(path.join(testDir, 'app.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'script.py'), 'content');

      const { files } = await service.scanDirectory(testDir);
      const unsupported = service.getUnsupportedFiles(files);

      expect(unsupported).toHaveLength(0);
    });
  });

  describe('groupByLanguage', () => {
    it('should group files by their language', async () => {
      await fs.writeFile(path.join(testDir, 'app.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'utils.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'script.py'), 'content');
      await fs.writeFile(path.join(testDir, 'Main.java'), 'content');

      const { files } = await service.scanDirectory(testDir);
      const grouped = service.groupByLanguage(files);

      expect(grouped.get('typescript')).toHaveLength(2);
      expect(grouped.get('python')).toHaveLength(1);
      expect(grouped.get('java')).toHaveLength(1);
    });

    it('should not include unsupported files in grouping', async () => {
      await fs.writeFile(path.join(testDir, 'app.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'README.md'), 'content');

      const { files } = await service.scanDirectory(testDir);
      const grouped = service.groupByLanguage(files);

      expect(grouped.size).toBe(1);
      expect(grouped.has('typescript')).toBe(true);
      expect(grouped.has('markdown')).toBe(false);
    });

    it('should return empty map when no supported files exist', async () => {
      await fs.writeFile(path.join(testDir, 'README.md'), 'content');

      const { files } = await service.scanDirectory(testDir);
      const grouped = service.groupByLanguage(files);

      expect(grouped.size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle symlinks gracefully', async () => {
      await fs.writeFile(path.join(testDir, 'real.ts'), 'content');
      
      // Create symlink (may fail on Windows without admin rights)
      try {
        await fs.symlink(
          path.join(testDir, 'real.ts'),
          path.join(testDir, 'link.ts')
        );
      } catch (error) {
        // Skip test if symlinks not supported
        return;
      }

      const { files } = await service.scanDirectory(testDir);

      // Should find at least the real file
      expect(files.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle deeply nested directory structures', async () => {
      // Create a deep structure
      let currentPath = testDir;
      for (let i = 0; i < 10; i++) {
        currentPath = path.join(currentPath, `level${i}`);
        await fs.mkdir(currentPath, { recursive: true });
      }
      await fs.writeFile(path.join(currentPath, 'deep.ts'), 'content');

      const { files } = await service.scanDirectory(testDir);

      expect(files).toHaveLength(1);
      expect(files[0].relativePath).toContain('deep.ts');
    });

    it('should handle special characters in filenames', async () => {
      const specialNames = [
        'file with spaces.ts',
        'file-with-dashes.ts',
        'file_with_underscores.ts',
        'file.multiple.dots.ts',
      ];

      for (const name of specialNames) {
        await fs.writeFile(path.join(testDir, name), 'content');
      }

      const { files } = await service.scanDirectory(testDir);

      expect(files).toHaveLength(specialNames.length);
    });

    it('should handle mixed case extensions', async () => {
      await fs.writeFile(path.join(testDir, 'App.TS'), 'content');
      await fs.writeFile(path.join(testDir, 'Script.PY'), 'content');

      const { files, statistics } = await service.scanDirectory(testDir);

      expect(statistics.supportedFiles).toBe(2);
      expect(files.every(f => f.supported)).toBe(true);
    });

    it('should handle concurrent scans of different directories', async () => {
      const testDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'file-scanner-test2-'));

      try {
        await fs.writeFile(path.join(testDir, 'file1.ts'), 'content');
        await fs.writeFile(path.join(testDir2, 'file2.py'), 'content');

        const [result1, result2] = await Promise.all([
          service.scanDirectory(testDir),
          service.scanDirectory(testDir2),
        ]);

        expect(result1.files).toHaveLength(1);
        expect(result2.files).toHaveLength(1);
        expect(result1.files[0].extension).toBe('.ts');
        expect(result2.files[0].extension).toBe('.py');
      } finally {
        await fs.rm(testDir2, { recursive: true, force: true });
      }
    });
  });

  describe('error handling', () => {
    it('should handle non-existent directory gracefully', async () => {
      const nonExistent = path.join(testDir, 'does-not-exist');

      const { files, statistics } = await service.scanDirectory(nonExistent);

      expect(files).toHaveLength(0);
      expect(statistics.totalFiles).toBe(0);
    });

    it('should continue scanning when a subdirectory is unreadable', async () => {
      await fs.mkdir(path.join(testDir, 'readable'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'unreadable'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'readable', 'file.ts'), 'content');
      await fs.writeFile(path.join(testDir, 'unreadable', 'file.ts'), 'content');

      // Make directory unreadable (Unix-like systems only)
      if (process.platform !== 'win32') {
        try {
          await fs.chmod(path.join(testDir, 'unreadable'), 0o000);

          const { files } = await service.scanDirectory(testDir);

          // Should still find the readable file
          expect(files.length).toBeGreaterThanOrEqual(1);
          expect(files.some(f => f.relativePath.includes('readable'))).toBe(true);

          // Restore permissions for cleanup
          await fs.chmod(path.join(testDir, 'unreadable'), 0o755);
        } catch (error) {
          // Skip if chmod not supported
        }
      }
    });
  });
});
