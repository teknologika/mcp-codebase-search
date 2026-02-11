/**
 * Configuration management system with validation
 * Loads configuration from environment variables and config file
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { resolve, join } from 'path';
import AjvModule, { type JSONSchemaType } from 'ajv';
import addFormatsModule from 'ajv-formats';
import type { Config, LogLevel } from '../types/index.js';

// Handle both ESM and CJS module formats
const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

/**
 * Current schema version
 */
export const SCHEMA_VERSION = '1.0.0';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Config = {
  lancedb: {
    persistPath: join(homedir(), '.codebase-memory', 'lancedb'),
  },
  embedding: {
    modelName: 'Xenova/all-MiniLM-L6-v2',
    cachePath: join(homedir(), '.codebase-memory', 'models'),
  },
  server: {
    port: 8008,
    host: 'localhost',
  },
  mcp: {
    transport: 'stdio',
  },
  ingestion: {
    batchSize: 100,
    maxFileSize: 1048576, // 1MB
  },
  search: {
    defaultMaxResults: 50,
    cacheTimeoutSeconds: 60,
  },
  logging: {
    level: 'info',
  },
  schemaVersion: SCHEMA_VERSION,
};

/**
 * AJV schema for configuration validation
 */
const configSchema: JSONSchemaType<Config> = {
  type: 'object',
  properties: {
    lancedb: {
      type: 'object',
      properties: {
        persistPath: { type: 'string', minLength: 1 },
      },
      required: ['persistPath'],
      additionalProperties: false,
    },
    embedding: {
      type: 'object',
      properties: {
        modelName: { type: 'string', minLength: 1 },
        cachePath: { type: 'string', minLength: 1 },
      },
      required: ['modelName', 'cachePath'],
      additionalProperties: false,
    },
    server: {
      type: 'object',
      properties: {
        port: { type: 'integer', minimum: 1, maximum: 65535 },
        host: { type: 'string', minLength: 1 },
        sessionSecret: { type: 'string', nullable: true },
      },
      required: ['port', 'host'],
      additionalProperties: false,
    },
    mcp: {
      type: 'object',
      properties: {
        transport: { type: 'string', enum: ['stdio'] },
      },
      required: ['transport'],
      additionalProperties: false,
    },
    ingestion: {
      type: 'object',
      properties: {
        batchSize: { type: 'integer', minimum: 1 },
        maxFileSize: { type: 'integer', minimum: 1 },
      },
      required: ['batchSize', 'maxFileSize'],
      additionalProperties: false,
    },
    search: {
      type: 'object',
      properties: {
        defaultMaxResults: { type: 'integer', minimum: 1 },
        cacheTimeoutSeconds: { type: 'integer', minimum: 0 },
      },
      required: ['defaultMaxResults', 'cacheTimeoutSeconds'],
      additionalProperties: false,
    },
    logging: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
      },
      required: ['level'],
      additionalProperties: false,
    },
    schemaVersion: { type: 'string', minLength: 1 },
  },
  required: [
    'lancedb',
    'embedding',
    'server',
    'mcp',
    'ingestion',
    'search',
    'logging',
    'schemaVersion',
  ],
  additionalProperties: false,
};

/**
 * Initialize AJV validator
 */
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validateConfig = ajv.compile(configSchema);

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(message: string, public errors: any[]) {
    super(message);
    this.name = 'ConfigValidationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Expand tilde in paths to home directory
 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (sourceValue !== undefined) {
      if (
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }
  
  return result;
}

/**
 * Load configuration from file
 */
function loadConfigFile(configPath?: string): Partial<Config> {
  if (!configPath) {
    return {};
  }

  const resolvedPath = expandPath(resolve(configPath));
  
  if (!existsSync(resolvedPath)) {
    throw new Error(`Configuration file not found: ${resolvedPath}`);
  }

  try {
    const fileContent = readFileSync(resolvedPath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    throw new Error(
      `Failed to parse configuration file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load configuration from environment variables
 */
function loadConfigFromEnv(): Partial<Config> {
  const env = process.env;
  const config: Partial<Config> = {};

  // LanceDB configuration
  if (env.LANCEDB_PERSIST_PATH) {
    config.lancedb = { persistPath: env.LANCEDB_PERSIST_PATH };
  }

  // Embedding configuration
  if (env.EMBEDDING_MODEL_NAME || env.EMBEDDING_CACHE_PATH) {
    config.embedding = {
      modelName: env.EMBEDDING_MODEL_NAME || DEFAULT_CONFIG.embedding.modelName,
      cachePath: env.EMBEDDING_CACHE_PATH || DEFAULT_CONFIG.embedding.cachePath,
    };
  }

  // Server configuration
  if (env.SERVER_PORT || env.SERVER_HOST) {
    config.server = {
      port: env.SERVER_PORT ? parseInt(env.SERVER_PORT, 10) : DEFAULT_CONFIG.server.port,
      host: env.SERVER_HOST || DEFAULT_CONFIG.server.host,
    };
  }

  // Ingestion configuration
  if (env.INGESTION_BATCH_SIZE || env.INGESTION_MAX_FILE_SIZE) {
    config.ingestion = {
      batchSize: env.INGESTION_BATCH_SIZE
        ? parseInt(env.INGESTION_BATCH_SIZE, 10)
        : DEFAULT_CONFIG.ingestion.batchSize,
      maxFileSize: env.INGESTION_MAX_FILE_SIZE
        ? parseInt(env.INGESTION_MAX_FILE_SIZE, 10)
        : DEFAULT_CONFIG.ingestion.maxFileSize,
    };
  }

  // Search configuration
  if (env.SEARCH_DEFAULT_MAX_RESULTS || env.SEARCH_CACHE_TIMEOUT_SECONDS) {
    config.search = {
      defaultMaxResults: env.SEARCH_DEFAULT_MAX_RESULTS
        ? parseInt(env.SEARCH_DEFAULT_MAX_RESULTS, 10)
        : DEFAULT_CONFIG.search.defaultMaxResults,
      cacheTimeoutSeconds: env.SEARCH_CACHE_TIMEOUT_SECONDS
        ? parseInt(env.SEARCH_CACHE_TIMEOUT_SECONDS, 10)
        : DEFAULT_CONFIG.search.cacheTimeoutSeconds,
    };
  }

  // Logging configuration
  if (env.LOG_LEVEL) {
    config.logging = { level: env.LOG_LEVEL as LogLevel };
  }

  return config;
}

/**
 * Expand paths in configuration
 */
function expandConfigPaths(config: Config): Config {
  return {
    ...config,
    lancedb: {
      persistPath: expandPath(config.lancedb.persistPath),
    },
    embedding: {
      ...config.embedding,
      cachePath: expandPath(config.embedding.cachePath),
    },
  };
}

/**
 * Load and validate configuration
 * 
 * Configuration is loaded in the following order (later sources override earlier ones):
 * 1. Default values
 * 2. Configuration file from default location (~/.codebase-memory/config.json) if it exists
 * 3. Configuration file (if explicitly provided via configPath parameter)
 * 4. Environment variables
 * 
 * @param configPath - Optional path to configuration file (overrides default location)
 * @returns Validated configuration object
 * @throws ConfigValidationError if configuration is invalid
 */
export function loadConfig(configPath?: string): Config {
  // Start with defaults
  let config: Config = { ...DEFAULT_CONFIG };

  // Try to load from default location first
  const defaultConfigPath = join(homedir(), '.codebase-memory', 'config.json');
  if (!configPath && existsSync(defaultConfigPath)) {
    try {
      const fileConfig = loadConfigFile(defaultConfigPath);
      config = deepMerge(config, fileConfig);
    } catch (error) {
      // Ignore errors from default config file - it's optional
      console.warn(`Warning: Failed to load default config from ${defaultConfigPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Merge config file if explicitly provided
  if (configPath) {
    const fileConfig = loadConfigFile(configPath);
    config = deepMerge(config, fileConfig);
  }

  // Merge environment variables (highest priority)
  const envConfig = loadConfigFromEnv();
  config = deepMerge(config, envConfig);

  // Expand paths (tilde to home directory)
  config = expandConfigPaths(config);

  // Validate configuration
  if (!validateConfig(config)) {
    const errors = validateConfig.errors || [];
    const errorMessages = errors.map(
      (err: any) => `${err.instancePath} ${err.message}`
    );
    throw new ConfigValidationError(
      `Configuration validation failed:\n${errorMessages.join('\n')}`,
      errors
    );
  }

  return config;
}

/**
 * Validate a configuration object without loading from file/env
 * Useful for testing
 */
export function validateConfigObject(config: unknown): config is Config {
  return validateConfig(config);
}

/**
 * Get validation errors for a configuration object
 */
export function getConfigValidationErrors(config: unknown): string[] {
  validateConfig(config);
  const errors = validateConfig.errors || [];
  return errors.map((err: any) => `${err.instancePath} ${err.message}`);
}
