/**
 * Shared type definitions for the codebase memory MCP server
 */

/**
 * Supported programming languages and file types
 */
export type Language = 
  | "csharp" 
  | "java" 
  | "javascript" 
  | "typescript" 
  | "python"
  | "svelte"
  | "vue"
  | "html"
  | "css"
  | "scss"
  | "json"
  | "markdown"
  | "yaml"
  | "dockerfile"
  | "plaintext";

/**
 * Types of code chunks that can be extracted
 */
export type ChunkType = "function" | "class" | "method" | "interface" | "property" | "field" | "file";

/**
 * Log levels for structured logging
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Configuration interface for the entire system
 */
export interface Config {
  lancedb: {
    persistPath: string;
  };
  embedding: {
    modelName: string;
    cachePath: string;
  };
  server: {
    port: number;
    host: string;
    sessionSecret?: string;
  };
  mcp: {
    transport: "stdio";
  };
  ingestion: {
    batchSize: number;
    maxFileSize: number;
    maxChunkTokens: number;
    chunkOverlapTokens: number;
    storeFullFiles: boolean; // Store complete file content in DB for portability
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
  isTestFile?: boolean;
  isLibraryFile?: boolean;
  fileHash?: string; // MD5 hash of the source file (added during ingestion)
  fileMtime?: string; // ISO 8601 - file mtime at time of ingestion
  fullFileContent?: string; // Complete file content (stored once per file for portability)
}

/**
 * Codebase metadata
 */
export interface CodebaseMetadata {
  name: string;
  path: string;
  chunkCount: number;
  fileCount: number;
  languages: string[];
  createdAt?: string; // ISO 8601 timestamp - when first ingested
  lastIngested?: string; // ISO 8601 timestamp - most recent ingest/rescan time
  lastModified?: string; // ISO 8601 timestamp - max file mtime across indexed files
  lastScanAge?: number; // Seconds since last ingest/rescan
  lastRescanChangedAt?: string; // ISO 8601 timestamp - most recent meaningful rescan diff
  lastRescanFilesChanged?: number;
  lastRescanFilesAdded?: number;
  lastRescanFilesModified?: number;
  lastRescanFilesDeleted?: number;
  lastRescanChangedFilePaths?: string[];
  tableName?: string; // LanceDB table name
  status?: 'active' | 'corrupted' | 'empty';
  lastError?: string; // Last error message if any
}

/**
 * File information in a codebase
 */
export interface FileInfo {
  filePath: string;
  language: Language;
  chunkCount: number;
  fileMtime: string; // ISO 8601 - mtime of file on disk when indexed
  sizeBytes: number;
  isTestFile: boolean;
  isLibraryFile: boolean;
  fileHash: string; // MD5 hash of the file
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
  excludeTests?: boolean;
  excludeLibraries?: boolean;
}

/**
 * Search results
 */
export interface SearchResults {
  query: string;
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
  lastIngested?: string;
  lastModified: string; // ISO 8601 timestamp - max file mtime across indexed files
  lastScanAge?: number; // Seconds since last ingest/rescan
  lastRescanChangedAt?: string;
  lastRescanFilesChanged?: number;
  lastRescanFilesAdded?: number;
  lastRescanFilesModified?: number;
  lastRescanFilesDeleted?: number;
  lastRescanChangedFilePaths?: string[];
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
  respectGitignore?: boolean;
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
  filesSuccessfullyParsed?: number; // Files that produced at least one chunk
  filesFailedToParse?: number; // Files that were attempted but failed or produced no chunks
}

/**
 * Rescan result statistics
 */
export interface RescanResult {
  codebaseName: string;
  filesScanned: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesUnchanged: number;
  filesIndexed: number;
  filesDropped: number;
  chunksAdded: number;
  chunksDeleted: number;
  durationMs: number;
  lastChangedFiles?: number;
  lastChangedAt?: string;
  lastChangedFilePaths?: string[];
  addedFilePaths?: string[];
  modifiedFilePaths?: string[];
  deletedFilePaths?: string[];
  droppedFilePaths?: string[];
}
