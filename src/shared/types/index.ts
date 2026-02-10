/**
 * Shared type definitions for the codebase memory MCP server
 */

/**
 * Supported programming languages
 */
export type Language = "csharp" | "java" | "javascript" | "typescript" | "python";

/**
 * Types of code chunks that can be extracted
 */
export type ChunkType = "function" | "class" | "method" | "interface" | "property" | "field";

/**
 * Log levels for structured logging
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Configuration interface for the entire system
 */
export interface Config {
  chromadb: {
    persistPath: string;
  };
  embedding: {
    modelName: string;
    cachePath: string;
  };
  server: {
    port: number;
    host: string;
  };
  mcp: {
    transport: "stdio";
  };
  ingestion: {
    batchSize: number;
    maxFileSize: number;
  };
  search: {
    defaultMaxResults: number;
    cacheTimeoutSeconds: number;
  };
  logging: {
    level: LogLevel;
  };
  schemaVersion: string;
}

/**
 * Code chunk with metadata
 */
export interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
  chunkType: ChunkType;
  language: Language;
  filePath: string;
}

/**
 * Codebase metadata
 */
export interface CodebaseMetadata {
  name: string;
  path: string;
  chunkCount: number;
  fileCount: number;
  lastIngestion: string; // ISO 8601 timestamp
  languages: string[];
}

/**
 * Search result
 */
export interface SearchResult {
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  chunkType: string;
  content: string;
  similarityScore: number;
  codebaseName: string;
}

/**
 * Search parameters
 */
export interface SearchParams {
  query: string;
  codebaseName?: string;
  language?: string;
  maxResults?: number;
}

/**
 * Search results
 */
export interface SearchResults {
  results: SearchResult[];
  totalResults: number;
  queryTime: number;
}

/**
 * Language statistics
 */
export interface LanguageStats {
  language: string;
  fileCount: number;
  chunkCount: number;
}

/**
 * Chunk type statistics
 */
export interface ChunkTypeStats {
  type: string;
  count: number;
}

/**
 * Detailed codebase statistics
 */
export interface CodebaseStats {
  name: string;
  path: string;
  chunkCount: number;
  fileCount: number;
  lastIngestion: string;
  languages: LanguageStats[];
  chunkTypes: ChunkTypeStats[];
  sizeBytes: number;
}

/**
 * Ingestion parameters
 */
export interface IngestionParams {
  path: string;
  name: string;
  config: Config;
}

/**
 * Ingestion statistics
 */
export interface IngestionStats {
  totalFiles: number;
  supportedFiles: number;
  unsupportedFiles: Map<string, number>;
  chunksCreated: number;
  languages: Map<string, LanguageStats>;
  durationMs: number;
}
