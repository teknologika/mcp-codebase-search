/**
 * File Scanner Service
 * 
 * Provides recursive file discovery with support for:
 * - Filtering by supported/unsupported extensions
 * - Respecting .gitignore patterns
 * - Skipping hidden directories
 * - Tracking file statistics during scanning
 */

import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { LanguageDetectionService } from '../parsing/language-detection.service.js';
import { createLogger } from '../../shared/logging/logger.js';

const logger = createLogger('info').child('FileScannerService');

/**
 * Statistics collected during file scanning
 */
export interface ScanStatistics {
  totalFiles: number;
  supportedFiles: number;
  unsupportedFiles: number;
  unsupportedByExtension: Map<string, number>;
  skippedHidden: number;
  skippedByGitignore: number;
}

/**
 * Scanned file information
 */
export interface ScannedFile {
  path: string;
  relativePath: string;
  extension: string;
  supported: boolean;
  language: string | null;
}

/**
 * Options for file scanning
 */
export interface ScanOptions {
  respectGitignore?: boolean;
  skipHiddenDirectories?: boolean;
  maxFileSize?: number; // in bytes
}

/**
 * File Scanner Service
 */
export class FileScannerService {
  private languageDetection: LanguageDetectionService;
  
  // Directories to always skip, regardless of gitignore
  private readonly ALWAYS_SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    'coverage',
    '.next',
    '.nuxt',
    '.cache',
    'vendor',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    'target', // Rust
    'bin', // Java/C#
    'obj', // C#
  ]);

  // Files to always skip, regardless of gitignore
  private readonly ALWAYS_SKIP_FILES = new Set([
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'composer.lock',
    'Gemfile.lock',
    'Cargo.lock',
  ]);

  constructor() {
    this.languageDetection = new LanguageDetectionService();
  }

  /**
   * Recursively scan a directory for files
   * 
   * @param directoryPath - Root directory to scan
   * @param options - Scanning options
   * @returns Array of scanned files and statistics
   */
  async scanDirectory(
    directoryPath: string,
    options: ScanOptions = {}
  ): Promise<{ files: ScannedFile[]; statistics: ScanStatistics }> {
    const {
      respectGitignore = true,
      skipHiddenDirectories = true,
      maxFileSize = 1048576, // 1MB default
    } = options;

    logger.info('Starting directory scan', { directoryPath, options });

    // Initialize statistics
    const statistics: ScanStatistics = {
      totalFiles: 0,
      supportedFiles: 0,
      unsupportedFiles: 0,
      unsupportedByExtension: new Map(),
      skippedHidden: 0,
      skippedByGitignore: 0,
    };

    // Load .gitignore if requested
    let gitignoreFilter: Ignore | null = null;
    if (respectGitignore) {
      gitignoreFilter = await this.loadGitignore(directoryPath);
    }

    // Scan recursively
    const files: ScannedFile[] = [];
    await this.scanRecursive(
      directoryPath,
      directoryPath,
      files,
      statistics,
      gitignoreFilter,
      skipHiddenDirectories,
      maxFileSize
    );

    logger.info(
      'Directory scan completed',
      {
        totalFiles: statistics.totalFiles,
        supportedFiles: statistics.supportedFiles,
        unsupportedFiles: statistics.unsupportedFiles,
      }
    );

    return { files, statistics };
  }

  /**
   * Recursive helper for directory scanning
   */
  private async scanRecursive(
    rootPath: string,
    currentPath: string,
    files: ScannedFile[],
    statistics: ScanStatistics,
    gitignoreFilter: Ignore | null,
    skipHiddenDirectories: boolean,
    maxFileSize: number
  ): Promise<void> {
    let entries: Dirent[];

    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (_error) {
      logger.warn('Failed to read directory, skipping');
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      // Skip hidden files/directories if requested
      if (skipHiddenDirectories && entry.name.startsWith('.')) {
        if (entry.isDirectory()) {
          statistics.skippedHidden++;
          logger.debug('Skipping hidden directory', { path: relativePath });
        }
        continue;
      }

      // Always skip certain directories (node_modules, dist, etc.)
      if (entry.isDirectory() && this.ALWAYS_SKIP_DIRS.has(entry.name)) {
        statistics.skippedByGitignore++;
        logger.debug('Skipping excluded directory', { path: relativePath, reason: 'always-skip-list' });
        continue;
      }

      if (entry.isFile() && this.ALWAYS_SKIP_FILES.has(entry.name)) {
        statistics.skippedByGitignore++;
        logger.debug('Skipping excluded file', { path: relativePath, reason: 'always-skip-list' });
        continue;
      }

      // Check gitignore filter
      if (gitignoreFilter && gitignoreFilter.ignores(relativePath)) {
        statistics.skippedByGitignore++;
        logger.debug('Skipping file (gitignore)', { path: relativePath });
        continue;
      }

      if (entry.isDirectory()) {
        // Recursively scan subdirectory
        await this.scanRecursive(
          rootPath,
          fullPath,
          files,
          statistics,
          gitignoreFilter,
          skipHiddenDirectories,
          maxFileSize
        );
      } else if (entry.isFile()) {
        // Check file size
        try {
          const stats = await fs.stat(fullPath);
          if (stats.size > maxFileSize) {
            logger.debug(
              'Skipping file (too large)',
              { path: relativePath, size: stats.size, maxFileSize }
            );
            continue;
          }
        } catch (_error) {
          logger.warn('Failed to stat file');
          continue;
        }

        // Classify file
        const classification = this.languageDetection.classifyFile(fullPath);
        statistics.totalFiles++;

        if (classification.supported) {
          statistics.supportedFiles++;
        } else {
          statistics.unsupportedFiles++;
          
          // Track unsupported extensions
          const ext = classification.extension || '(no extension)';
          const count = statistics.unsupportedByExtension.get(ext) || 0;
          statistics.unsupportedByExtension.set(ext, count + 1);
        }

        files.push({
          path: fullPath,
          relativePath,
          extension: classification.extension,
          supported: classification.supported,
          language: classification.language,
        });
      }
    }
  }

  /**
   * Load .gitignore files from directory and parent directories
   * 
   * @param directoryPath - Directory to start searching from
   * @returns Ignore instance with all parent .gitignore patterns or null
   */
  private async loadGitignore(directoryPath: string): Promise<Ignore | null> {
    const ig = ignore();
    let hasPatterns = false;
    let currentPath = path.resolve(directoryPath);
    const root = path.parse(currentPath).root;

    // Walk up the directory tree until we hit the root
    while (currentPath !== root) {
      const gitignorePath = path.join(currentPath, '.gitignore');

      try {
        const content = await fs.readFile(gitignorePath, 'utf-8');
        ig.add(content);
        hasPatterns = true;
        logger.debug('Loaded .gitignore', { path: gitignorePath });
      } catch (_error) {
        // .gitignore not found at this level - continue up
      }

      // Stop if we find a .git directory (project root)
      try {
        const gitDir = path.join(currentPath, '.git');
        await fs.access(gitDir);
        logger.debug('Found .git directory, stopping .gitignore search', { path: currentPath });
        break;
      } catch {
        // No .git directory, continue up
      }

      // Move up one directory
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        // Reached root
        break;
      }
      currentPath = parentPath;
    }

    if (!hasPatterns) {
      logger.debug('No .gitignore files found in directory tree');
      return null;
    }

    return ig;
  }

  /**
   * Get supported files from scan results
   * 
   * @param files - Array of scanned files
   * @returns Array of supported files only
   */
  getSupportedFiles(files: ScannedFile[]): ScannedFile[] {
    return files.filter((file) => file.supported);
  }

  /**
   * Get unsupported files from scan results
   * 
   * @param files - Array of scanned files
   * @returns Array of unsupported files only
   */
  getUnsupportedFiles(files: ScannedFile[]): ScannedFile[] {
    return files.filter((file) => !file.supported);
  }

  /**
   * Group files by language
   * 
   * @param files - Array of scanned files
   * @returns Map of language to files
   */
  groupByLanguage(files: ScannedFile[]): Map<string, ScannedFile[]> {
    const grouped = new Map<string, ScannedFile[]>();

    for (const file of files) {
      if (file.language) {
        const existing = grouped.get(file.language) || [];
        existing.push(file);
        grouped.set(file.language, existing);
      }
    }

    return grouped;
  }
}
