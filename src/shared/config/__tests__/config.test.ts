/**
 * Unit tests for configuration management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadConfig,
  validateConfigObject,
  getConfigValidationErrors,
  ConfigValidationError,
  DEFAULT_CONFIG,
  SCHEMA_VERSION,
} from '../config.js';
import type { Config } from '../../types/index.js';

describe('Configuration Management', () => {
  let testConfigPath: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Create temp directory for test config files
    const tempDir = join(tmpdir(), 'config-test-' + Date.now());
    mkdirSync(tempDir, { recursive: true });
    testConfigPath = join(tempDir, 'test-config.json');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up test files
    try {
      const tempDir = join(testConfigPath, '..');
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('loadConfig', () => {
    it('should return default configuration when no config file or env vars provided', () => {
      const config = loadConfig();
      
      expect(config).toEqual(DEFAULT_CONFIG);
      expect(config.server.port).toBe(8008);
      expect(config.ingestion.batchSize).toBe(100);
      expect(config.search.defaultMaxResults).toBe(50);
      expect(config.logging.level).toBe('info');
      expect(config.schemaVersion).toBe(SCHEMA_VERSION);
    });

    it('should load configuration from file', () => {
      const fileConfig: Config = {
        ...DEFAULT_CONFIG,
        server: {
          port: 9000,
          host: '0.0.0.0',
        },
        logging: {
          level: 'debug',
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(fileConfig, null, 2));
      const config = loadConfig(testConfigPath);

      expect(config.server.port).toBe(9000);
      expect(config.server.host).toBe('0.0.0.0');
      expect(config.logging.level).toBe('debug');
    });

    it('should override file config with environment variables', () => {
      const fileConfig: Config = {
        ...DEFAULT_CONFIG,
        server: {
          port: 9000,
          host: 'localhost',
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(fileConfig, null, 2));
      
      process.env.SERVER_PORT = '9999';
      process.env.LOG_LEVEL = 'error';

      const config = loadConfig(testConfigPath);

      expect(config.server.port).toBe(9999);
      expect(config.server.host).toBe('localhost'); // From file
      expect(config.logging.level).toBe('error'); // From env
    });

    it('should load all environment variables correctly', () => {
      process.env.LANCEDB_PERSIST_PATH = '/custom/lancedb';
      process.env.EMBEDDING_MODEL_NAME = 'custom-model';
      process.env.EMBEDDING_CACHE_PATH = '/custom/cache';
      process.env.SERVER_PORT = '7777';
      process.env.SERVER_HOST = '127.0.0.1';
      process.env.INGESTION_BATCH_SIZE = '200';
      process.env.INGESTION_MAX_FILE_SIZE = '2097152';
      process.env.SEARCH_DEFAULT_MAX_RESULTS = '100';
      process.env.SEARCH_CACHE_TIMEOUT_SECONDS = '120';
      process.env.LOG_LEVEL = 'warn';

      const config = loadConfig();

      expect(config.lancedb.persistPath).toBe('/custom/lancedb');
      expect(config.embedding.modelName).toBe('custom-model');
      expect(config.embedding.cachePath).toBe('/custom/cache');
      expect(config.server.port).toBe(7777);
      expect(config.server.host).toBe('127.0.0.1');
      expect(config.ingestion.batchSize).toBe(200);
      expect(config.ingestion.maxFileSize).toBe(2097152);
      expect(config.search.defaultMaxResults).toBe(100);
      expect(config.search.cacheTimeoutSeconds).toBe(120);
      expect(config.logging.level).toBe('warn');
    });

    it('should expand tilde in paths', () => {
      const fileConfig: Partial<Config> = {
        lancedb: {
          persistPath: '~/custom/lancedb',
        },
        embedding: {
          modelName: 'test-model',
          cachePath: '~/custom/cache',
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(fileConfig, null, 2));
      const config = loadConfig(testConfigPath);

      expect(config.lancedb.persistPath).not.toContain('~');
      expect(config.embedding.cachePath).not.toContain('~');
      expect(config.lancedb.persistPath).toContain('custom/lancedb');
      expect(config.embedding.cachePath).toContain('custom/cache');
    });

    it('should throw error for non-existent config file', () => {
      expect(() => loadConfig('/non/existent/config.json')).toThrow(
        'Configuration file not found'
      );
    });

    it('should throw error for invalid JSON in config file', () => {
      writeFileSync(testConfigPath, 'invalid json {');
      
      expect(() => loadConfig(testConfigPath)).toThrow(
        'Failed to parse configuration file'
      );
    });

    it('should throw ConfigValidationError for invalid port number', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        server: {
          ...DEFAULT_CONFIG.server,
          port: -1,
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => loadConfig(testConfigPath)).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for port out of range', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        server: {
          ...DEFAULT_CONFIG.server,
          port: 70000,
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => loadConfig(testConfigPath)).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid log level', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        logging: {
          level: 'invalid' as any,
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => loadConfig(testConfigPath)).toThrow(ConfigValidationError);
    });

    it('should use defaults for missing fields in config file', () => {
      const partialConfig = {
        lancedb: {
          persistPath: '/custom/path',
        },
        // Missing other fields - should use defaults
      };

      writeFileSync(testConfigPath, JSON.stringify(partialConfig, null, 2));

      const config = loadConfig(testConfigPath);
      
      // Custom value from file
      expect(config.lancedb.persistPath).toBe('/custom/path');
      
      // Defaults for missing fields
      expect(config.embedding).toEqual(DEFAULT_CONFIG.embedding);
      expect(config.server).toEqual(DEFAULT_CONFIG.server);
      expect(config.mcp).toEqual(DEFAULT_CONFIG.mcp);
      expect(config.ingestion).toEqual(DEFAULT_CONFIG.ingestion);
      expect(config.search).toEqual(DEFAULT_CONFIG.search);
      expect(config.logging).toEqual(DEFAULT_CONFIG.logging);
      expect(config.schemaVersion).toBe(DEFAULT_CONFIG.schemaVersion);
    });

    it('should throw ConfigValidationError for negative batch size', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        ingestion: {
          ...DEFAULT_CONFIG.ingestion,
          batchSize: 0,
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => loadConfig(testConfigPath)).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for empty string values', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        embedding: {
          modelName: '',
          cachePath: '/path',
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => loadConfig(testConfigPath)).toThrow(ConfigValidationError);
    });

    it('should reject additional properties', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        extraProperty: 'should not be here',
      };

      writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => loadConfig(testConfigPath)).toThrow(ConfigValidationError);
    });
  });

  describe('validateConfigObject', () => {
    it('should return true for valid config', () => {
      expect(validateConfigObject(DEFAULT_CONFIG)).toBe(true);
    });

    it('should return false for invalid config', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        server: {
          ...DEFAULT_CONFIG.server,
          port: -1,
        },
      };

      expect(validateConfigObject(invalidConfig)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(validateConfigObject(null)).toBe(false);
      expect(validateConfigObject('string')).toBe(false);
      expect(validateConfigObject(123)).toBe(false);
    });
  });

  describe('getConfigValidationErrors', () => {
    it('should return empty array for valid config', () => {
      const errors = getConfigValidationErrors(DEFAULT_CONFIG);
      expect(errors).toEqual([]);
    });

    it('should return error messages for invalid config', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        server: {
          ...DEFAULT_CONFIG.server,
          port: -1,
        },
      };

      const errors = getConfigValidationErrors(invalidConfig);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('port');
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        server: {
          ...DEFAULT_CONFIG.server,
          port: -1,
        },
        ingestion: {
          ...DEFAULT_CONFIG.ingestion,
          batchSize: 0,
        },
      };

      const errors = getConfigValidationErrors(invalidConfig);
      expect(errors.length).toBeGreaterThan(1);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CONFIG.server.port).toBe(8008);
      expect(DEFAULT_CONFIG.server.host).toBe('localhost');
      expect(DEFAULT_CONFIG.ingestion.batchSize).toBe(100);
      expect(DEFAULT_CONFIG.ingestion.maxFileSize).toBe(1048576);
      expect(DEFAULT_CONFIG.search.defaultMaxResults).toBe(50);
      expect(DEFAULT_CONFIG.search.cacheTimeoutSeconds).toBe(60);
      expect(DEFAULT_CONFIG.logging.level).toBe('info');
      expect(DEFAULT_CONFIG.mcp.transport).toBe('stdio');
      expect(DEFAULT_CONFIG.embedding.modelName).toBe('Xenova/all-MiniLM-L6-v2');
      expect(DEFAULT_CONFIG.schemaVersion).toBe(SCHEMA_VERSION);
    });

    it('should have valid paths', () => {
      expect(DEFAULT_CONFIG.lancedb.persistPath).toContain('.codebase-memory');
      expect(DEFAULT_CONFIG.embedding.cachePath).toContain('.codebase-memory');
    });
  });

  describe('ConfigValidationError', () => {
    it('should include error details', () => {
      const errors = [{ instancePath: '/server/port', message: 'must be >= 1' }];
      const error = new ConfigValidationError('Validation failed', errors);

      expect(error.name).toBe('ConfigValidationError');
      expect(error.message).toBe('Validation failed');
      expect(error.errors).toEqual(errors);
    });
  });

  describe('Edge Cases', () => {
    it('should handle partial config file with defaults', () => {
      const partialConfig = {
        server: {
          port: 9000,
          host: 'localhost',
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(partialConfig, null, 2));
      const config = loadConfig(testConfigPath);

      expect(config.server.port).toBe(9000);
      expect(config.ingestion.batchSize).toBe(DEFAULT_CONFIG.ingestion.batchSize);
      expect(config.logging.level).toBe(DEFAULT_CONFIG.logging.level);
    });

    it('should handle numeric strings in environment variables', () => {
      process.env.SERVER_PORT = '8080';
      process.env.INGESTION_BATCH_SIZE = '50';

      const config = loadConfig();

      expect(config.server.port).toBe(8080);
      expect(config.ingestion.batchSize).toBe(50);
    });

    it('should validate MCP transport is stdio only', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        mcp: {
          transport: 'http' as any,
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => loadConfig(testConfigPath)).toThrow(ConfigValidationError);
    });

    it('should handle zero cache timeout', () => {
      const config = {
        ...DEFAULT_CONFIG,
        search: {
          ...DEFAULT_CONFIG.search,
          cacheTimeoutSeconds: 0,
        },
      };

      writeFileSync(testConfigPath, JSON.stringify(config, null, 2));
      const loadedConfig = loadConfig(testConfigPath);

      expect(loadedConfig.search.cacheTimeoutSeconds).toBe(0);
    });
  });
});
