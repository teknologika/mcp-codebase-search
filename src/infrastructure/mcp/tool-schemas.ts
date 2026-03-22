/**
 * MCP Tool Schemas
 * 
 * JSON schemas for all MCP tools exposed by the codebase memory server.
 * These schemas define input validation rules and output formats for each tool.
 * 
 * Validates: Requirements 15.1
 */

/**
 * Schema for list_codebases tool
 * 
 * Lists all indexed codebases with their metadata.
 * No input parameters required.
 */
export const LIST_CODEBASES_SCHEMA = {
  name: 'list_codebases',
  description: 'List all indexed codebases with their metadata including name, path, chunk count, file count, last ingestion timestamp, and supported languages.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      codebases: {
        type: 'array',
        description: 'Array of all indexed codebases',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Unique name of the codebase',
            },
            path: {
              type: 'string',
              description: 'File system path to the codebase directory',
            },
            chunkCount: {
              type: 'number',
              description: 'Total number of code chunks indexed',
              minimum: 0,
            },
            fileCount: {
              type: 'number',
              description: 'Total number of files processed',
              minimum: 0,
            },
            lastIngestion: {
              type: 'string',
              description: 'ISO 8601 timestamp of the last ingestion',
              format: 'date-time',
            },
            lastScanAge: {
              type: 'number',
              description: 'Seconds since the last ingestion',
              minimum: 0,
            },
            languages: {
              type: 'array',
              description: 'List of programming languages detected in the codebase',
              items: {
                type: 'string',
              },
            },
          },
          required: ['name', 'path', 'chunkCount', 'fileCount', 'lastIngestion', 'languages'],
          additionalProperties: false,
        },
      },
    },
    required: ['codebases'],
    additionalProperties: false,
  },
} as const;

/**
 * Schema for search_codebases tool
 * 
 * Performs semantic search across indexed codebases.
 * Accepts a query string and optional filters for codebase name, language, and max results.
 */
export const SEARCH_CODEBASES_SCHEMA = {
  name: 'search_codebases',
  description: 'Search indexed codebases using semantic search. Returns code chunks ranked by similarity to the query. By default returns metadata only (file paths, line numbers, similarity scores) for efficient scanning. Use get_chunk_content to retrieve full code content for specific results.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query describing the code you want to find (e.g., "authentication function", "database connection class")',
        minLength: 1,
      },
      codebaseName: {
        type: 'string',
        description: 'Optional filter to search only within a specific codebase',
        pattern: '^[a-zA-Z0-9_-]{1,64}$',
      },
      language: {
        type: 'string',
        description: 'Optional filter to search only for code in a specific language',
        enum: ['csharp', 'java', 'javascript', 'typescript', 'python', 'svelte', 'vue', 'html', 'css', 'scss'],
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 20)',
        minimum: 1,
        maximum: 100,
        default: 20,
      },
      includeContent: {
        type: 'boolean',
        description: 'Include full code content in results (default: false). Set to true only when you need the actual code.',
        default: false,
      },
      topContentResults: {
        type: 'number',
        description: 'Include full code content for the top N results by similarity score (default: 0 = no content). More efficient than includeContent: true when you only need code for the best matches.',
        minimum: 0,
        maximum: 10,
        default: 0,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        description: 'Array of search results ranked by similarity score',
        items: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Relative path to the file containing this code chunk',
            },
            startLine: {
              type: 'number',
              description: 'Starting line number of the code chunk (1-indexed)',
              minimum: 1,
            },
            endLine: {
              type: 'number',
              description: 'Ending line number of the code chunk (1-indexed)',
              minimum: 1,
            },
            language: {
              type: 'string',
              description: 'Programming language of the code chunk',
              enum: ['csharp', 'java', 'javascript', 'typescript', 'python'],
            },
            chunkType: {
              type: 'string',
              description: 'Type of code construct',
              enum: ['function', 'class', 'method', 'interface', 'property', 'field'],
            },
            content: {
              type: 'string',
              description: 'The actual code content of the chunk (included when includeContent=true or for the topContentResults matches)',
            },
            similarityScore: {
              type: 'number',
              description: 'Similarity score between 0 and 1 (higher is more similar)',
              minimum: 0,
              maximum: 1,
            },
            codebaseName: {
              type: 'string',
              description: 'Name of the codebase containing this chunk (included when includeContent=true or for the topContentResults matches)',
            },
          },
          required: [
            'filePath',
            'startLine',
            'endLine',
            'language',
            'chunkType',
            'similarityScore',
          ],
          additionalProperties: false,
        },
      },
      totalResults: {
        type: 'number',
        description: 'Total number of results found (may be greater than results returned)',
        minimum: 0,
      },
      queryTime: {
        type: 'number',
        description: 'Time taken to execute the query in milliseconds',
        minimum: 0,
      },
      staleWarning: {
        type: 'string',
        description: 'Advisory warning when the codebase index may be stale',
      },
    },
    required: ['results', 'totalResults', 'queryTime'],
    additionalProperties: false,
  },
} as const;

/**
 * Schema for get_codebase_stats tool
 * 
 * Retrieves detailed statistics for a specific codebase.
 * Requires the codebase name as input.
 */
export const GET_CODEBASE_STATS_SCHEMA = {
  name: 'get_codebase_stats',
  description: 'Get detailed statistics for a specific codebase including chunk count, file count, language distribution, chunk type distribution, and storage size.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the codebase to retrieve statistics for',
        minLength: 1,
      },
    },
    required: ['name'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the codebase',
      },
      path: {
        type: 'string',
        description: 'File system path to the codebase directory',
      },
      chunkCount: {
        type: 'number',
        description: 'Total number of code chunks indexed',
        minimum: 0,
      },
      fileCount: {
        type: 'number',
        description: 'Total number of files processed',
        minimum: 0,
      },
      lastIngestion: {
        type: 'string',
        description: 'ISO 8601 timestamp of the last ingestion',
        format: 'date-time',
      },
      languages: {
        type: 'array',
        description: 'Language distribution statistics',
        items: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              description: 'Programming language name',
            },
            fileCount: {
              type: 'number',
              description: 'Number of files in this language',
              minimum: 0,
            },
            chunkCount: {
              type: 'number',
              description: 'Number of chunks in this language',
              minimum: 0,
            },
          },
          required: ['language', 'fileCount', 'chunkCount'],
          additionalProperties: false,
        },
      },
      chunkTypes: {
        type: 'array',
        description: 'Chunk type distribution statistics',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Type of code construct',
              enum: ['function', 'class', 'method', 'interface', 'property', 'field'],
            },
            count: {
              type: 'number',
              description: 'Number of chunks of this type',
              minimum: 0,
            },
          },
          required: ['type', 'count'],
          additionalProperties: false,
        },
      },
      sizeBytes: {
        type: 'number',
        description: 'Total size of all code chunks in bytes',
        minimum: 0,
      },
    },
    required: ['name', 'path', 'chunkCount', 'fileCount', 'lastIngestion', 'languages', 'chunkTypes', 'sizeBytes'],
    additionalProperties: false,
  },
} as const;

/**
 * Schema for open_codebase_manager tool
 * 
 * Opens the web-based codebase manager UI in the default browser.
 * No input parameters required.
 */
export const OPEN_CODEBASE_MANAGER_SCHEMA = {
  name: 'open_codebase_manager',
  description: 'Open the web-based codebase manager UI in the default browser. The manager provides a visual interface for viewing codebase statistics, renaming codebases, and deleting codebases.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL of the manager UI (e.g., "http://localhost:8008")',
        format: 'uri',
      },
      message: {
        type: 'string',
        description: 'Status message about the operation',
      },
    },
    required: ['url', 'message'],
    additionalProperties: false,
  },
} as const;

/**
 * Schema for list_files tool
 * 
 * Lists all files in a codebase with metadata
 */
export const LIST_FILES_SCHEMA = {
  name: 'list_files',
  description: 'List all files in a codebase with metadata including chunk count, language, size, and last ingestion timestamp. Useful for understanding codebase structure and finding specific files.',
  inputSchema: {
    type: 'object',
    properties: {
      codebaseName: {
        type: 'string',
        description: 'Name of the codebase to list files from',
        pattern: '^[a-zA-Z0-9_-]{1,64}$',
      },
    },
    required: ['codebaseName'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Array of files in the codebase',
        items: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Relative path to the file',
            },
            language: {
              type: 'string',
              description: 'Programming language of the file',
            },
            chunkCount: {
              type: 'number',
              description: 'Number of chunks extracted from this file',
              minimum: 0,
            },
            lastIngestion: {
              type: 'string',
              description: 'ISO 8601 timestamp of last ingestion',
            },
            sizeBytes: {
              type: 'number',
              description: 'Total size of all chunks in bytes',
              minimum: 0,
            },
            isTestFile: {
              type: 'boolean',
              description: 'Whether this is a test file',
            },
            isLibraryFile: {
              type: 'boolean',
              description: 'Whether this is a library/vendor file',
            },
          },
          required: ['filePath', 'language', 'chunkCount', 'lastIngestion', 'sizeBytes', 'isTestFile', 'isLibraryFile'],
        },
      },
      codebaseName: {
        type: 'string',
        description: 'Name of the codebase',
      },
      totalFiles: {
        type: 'number',
        description: 'Total number of files',
        minimum: 0,
      },
    },
    required: ['files', 'codebaseName', 'totalFiles'],
    additionalProperties: false,
  },
} as const;

/**
 * Schema for update_codebase_scan tool
 * 
 * Refreshes an existing codebase by re-scanning and re-indexing all files
 */
export const UPDATE_CODEBASE_SCAN_SCHEMA = {
  name: 'update_codebase_scan',
  description: 'Refresh an existing codebase scan by re-ingesting all files. This will detect new files, updated files, and deleted files, then update the index accordingly. Useful when the codebase has changed since the last scan.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the codebase to refresh',
        minLength: 1,
      },
      verbose: {
        type: 'boolean',
        description: 'Include verbose file path details in the response',
        default: false,
      },
    },
    required: ['name'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the codebase that was refreshed',
      },
      path: {
        type: 'string',
        description: 'File system path to the codebase directory',
      },
      filesScanned: {
        type: 'number',
        description: 'Total number of supported files scanned',
        minimum: 0,
      },
      filesAdded: {
        type: 'number',
        description: 'Number of files added during rescan',
        minimum: 0,
      },
      filesModified: {
        type: 'number',
        description: 'Number of files modified during rescan',
        minimum: 0,
      },
      filesDeleted: {
        type: 'number',
        description: 'Number of files deleted during rescan',
        minimum: 0,
      },
      filesUnchanged: {
        type: 'number',
        description: 'Number of files that did not change during rescan',
        minimum: 0,
      },
      chunksAdded: {
        type: 'number',
        description: 'Total number of code chunks created',
        minimum: 0,
      },
      chunksDeleted: {
        type: 'number',
        description: 'Total number of code chunks deleted',
        minimum: 0,
      },
      cacheCleared: {
        type: 'boolean',
        description: 'Whether the in-memory search cache was cleared after rescan',
      },
      addedFilePaths: {
        type: 'array',
        description: 'File paths added during the rescan (verbose mode only)',
        items: {
          type: 'string',
        },
      },
      modifiedFilePaths: {
        type: 'array',
        description: 'File paths modified during the rescan (verbose mode only)',
        items: {
          type: 'string',
        },
      },
      deletedFilePaths: {
        type: 'array',
        description: 'File paths deleted during the rescan (verbose mode only)',
        items: {
          type: 'string',
        },
      },
      durationMs: {
        type: 'number',
        description: 'Time taken to complete the refresh in milliseconds',
        minimum: 0,
      },
      message: {
        type: 'string',
        description: 'Status message about the operation',
      },
    },
    required: ['name', 'path', 'filesScanned', 'filesAdded', 'filesModified', 'filesDeleted', 'filesUnchanged', 'chunksAdded', 'chunksDeleted', 'cacheCleared', 'durationMs', 'message'],
    additionalProperties: false,
  },
} as const;

/**
 * Schema for get_chunk_content tool
 * 
 * Retrieves full code content for specific chunks identified by file path and line numbers
 */
export const GET_CHUNK_CONTENT_SCHEMA = {
  name: 'get_chunk_content',
  description: 'Retrieve full code content for specific chunks. Use this after search_codebases to get the actual code for chunks you want to examine. Provide the codebase name, file path, and line range from search results.',
  inputSchema: {
    type: 'object',
    properties: {
      codebaseName: {
        type: 'string',
        description: 'Name of the codebase containing the chunk',
        minLength: 1,
        pattern: '^[a-zA-Z0-9_-]{1,64}$',
      },
      filePath: {
        type: 'string',
        description: 'Relative file path from search results',
        minLength: 1,
      },
      startLine: {
        type: 'number',
        description: 'Starting line number of the chunk',
        minimum: 1,
      },
      endLine: {
        type: 'number',
        description: 'Ending line number of the chunk',
        minimum: 1,
      },
    },
    required: ['codebaseName', 'filePath', 'startLine', 'endLine'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      codebaseName: {
        type: 'string',
        description: 'Name of the codebase',
      },
      filePath: {
        type: 'string',
        description: 'Relative file path',
      },
      startLine: {
        type: 'number',
        description: 'Starting line number',
        minimum: 1,
      },
      endLine: {
        type: 'number',
        description: 'Ending line number',
        minimum: 1,
      },
      language: {
        type: 'string',
        description: 'Programming language',
      },
      chunkType: {
        type: 'string',
        description: 'Type of code construct',
      },
      content: {
        type: 'string',
        description: 'Full code content of the chunk',
      },
      lineNumberDrift: {
        type: 'number',
        description: 'Difference between requested and actual start line when fuzzy matching is used',
      },
      staleWarning: {
        type: 'string',
        description: 'Advisory warning when the codebase index may be stale',
      },
    },
    required: ['codebaseName', 'filePath', 'startLine', 'endLine', 'language', 'chunkType', 'content'],
    additionalProperties: false,
  },
} as const;

/**
 * Schema for get_file_content tool
 * 
 * Retrieves entire file content by reconstructing from all chunks
 */
export const GET_FILE_CONTENT_SCHEMA = {
  name: 'get_file_content',
  description: 'Retrieve entire file content by reconstructing from all indexed chunks. Use this when you need the complete file after identifying it through search. Provide the codebase name and file path.',
  inputSchema: {
    type: 'object',
    properties: {
      codebaseName: {
        type: 'string',
        description: 'Name of the codebase containing the file',
        minLength: 1,
        pattern: '^[a-zA-Z0-9_-]{1,64}$',
      },
      filePath: {
        type: 'string',
        description: 'Relative file path from search results',
        minLength: 1,
      },
    },
    required: ['codebaseName', 'filePath'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      codebaseName: {
        type: 'string',
        description: 'Name of the codebase',
      },
      filePath: {
        type: 'string',
        description: 'Relative file path',
      },
      language: {
        type: 'string',
        description: 'Programming language',
      },
      content: {
        type: 'string',
        description: 'Full file content reconstructed from all chunks',
      },
      chunkCount: {
        type: 'number',
        description: 'Number of chunks that made up this file',
        minimum: 0,
      },
      totalLines: {
        type: 'number',
        description: 'Total number of lines in the file',
        minimum: 0,
      },
    },
    required: ['codebaseName', 'filePath', 'language', 'content', 'chunkCount', 'totalLines'],
    additionalProperties: false,
  },
} as const;

/**
 * Schema for get_adjacent_chunks tool
 *
 * Retrieves chunks immediately before and after a given line range in a file.
 * Use when a search result has a chunkType like "method_part_2" or "class_part_5"
 * to retrieve surrounding context without fetching the entire file.
 */
export const GET_ADJACENT_CHUNKS_SCHEMA = {
  name: 'get_adjacent_chunks',
  description: 'Retrieve chunks immediately before and after a specific chunk in a file. Use when a search result has a split chunkType (e.g. "method_part_2", "class_part_5") to get surrounding context without fetching the entire file. Returns up to N chunks on each side ordered by line number.',
  inputSchema: {
    type: 'object',
    properties: {
      codebaseName: {
        type: 'string',
        description: 'Name of the codebase',
        minLength: 1,
        pattern: '^[a-zA-Z0-9_-]{1,64}$',
      },
      filePath: {
        type: 'string',
        description: 'Relative file path of the chunk',
        minLength: 1,
      },
      startLine: {
        type: 'number',
        description: 'Start line of the reference chunk (from search results)',
        minimum: 1,
      },
      endLine: {
        type: 'number',
        description: 'End line of the reference chunk (from search results)',
        minimum: 1,
      },
      before: {
        type: 'number',
        description: 'Number of chunks to return before this chunk (default: 1)',
        minimum: 0,
        maximum: 5,
        default: 1,
      },
      after: {
        type: 'number',
        description: 'Number of chunks to return after this chunk (default: 1)',
        minimum: 0,
        maximum: 5,
        default: 1,
      },
    },
    required: ['codebaseName', 'filePath', 'startLine', 'endLine'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      before: {
        type: 'array',
        description: 'Chunks immediately before the reference chunk',
        items: {
          type: 'object',
          properties: {
            startLine: {
              type: 'number',
              description: 'Starting line number of the chunk',
              minimum: 1,
            },
            endLine: {
              type: 'number',
              description: 'Ending line number of the chunk',
              minimum: 1,
            },
            chunkType: {
              type: 'string',
              description: 'Type of code construct for the chunk',
            },
            content: {
              type: 'string',
              description: 'Chunk content',
            },
          },
          required: ['startLine', 'endLine', 'chunkType', 'content'],
          additionalProperties: false,
        },
      },
      reference: {
        type: ['object', 'null'],
        description: 'The reference chunk that was used to locate adjacent chunks, or null if no matching chunk was found',
        properties: {
          startLine: {
            type: 'number',
            description: 'Starting line number of the chunk',
            minimum: 1,
          },
          endLine: {
            type: 'number',
            description: 'Ending line number of the chunk',
            minimum: 1,
          },
          chunkType: {
            type: 'string',
            description: 'Type of code construct for the chunk',
          },
        },
        required: ['startLine', 'endLine', 'chunkType'],
        additionalProperties: false,
      },
      after: {
        type: 'array',
        description: 'Chunks immediately after the reference chunk',
        items: {
          type: 'object',
          properties: {
            startLine: {
              type: 'number',
              description: 'Starting line number of the chunk',
              minimum: 1,
            },
            endLine: {
              type: 'number',
              description: 'Ending line number of the chunk',
              minimum: 1,
            },
            chunkType: {
              type: 'string',
              description: 'Type of code construct for the chunk',
            },
            content: {
              type: 'string',
              description: 'Chunk content',
            },
          },
          required: ['startLine', 'endLine', 'chunkType', 'content'],
          additionalProperties: false,
        },
      },
    },
    required: ['before', 'reference', 'after'],
    additionalProperties: false,
  },
} as const;

/**
 * All tool schemas exported as an array for easy registration
 */
export const ALL_TOOL_SCHEMAS = [
  LIST_CODEBASES_SCHEMA,
  SEARCH_CODEBASES_SCHEMA,
  GET_CODEBASE_STATS_SCHEMA,
  OPEN_CODEBASE_MANAGER_SCHEMA,
  LIST_FILES_SCHEMA,
  UPDATE_CODEBASE_SCAN_SCHEMA,
  GET_CHUNK_CONTENT_SCHEMA,
  GET_FILE_CONTENT_SCHEMA,
  GET_ADJACENT_CHUNKS_SCHEMA,
] as const;

/**
 * Type definitions for tool inputs and outputs
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ListCodebasesInput {
  // No parameters required for listing codebases
}

export interface ListCodebasesOutput {
  codebases: Array<{
    name: string;
    path: string;
    chunkCount: number;
    fileCount: number;
    lastIngestion: string;
    lastScanAge?: number;
    languages: string[];
  }>;
}

export interface SearchCodebasesInput {
  query: string;
  codebaseName?: string;
  language?: 'csharp' | 'java' | 'javascript' | 'typescript' | 'python';
  maxResults?: number;
  includeContent?: boolean;
  topContentResults?: number;
}

export interface SearchCodebasesOutput {
  results: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
    language: string;
    chunkType: string;
    similarityScore: number;
    content?: string;
    codebaseName?: string;
  }>;
  totalResults: number;
  queryTime: number;
  staleWarning?: string;
}

export interface GetCodebaseStatsInput {
  name: string;
}

export interface GetCodebaseStatsOutput {
  name: string;
  path: string;
  chunkCount: number;
  fileCount: number;
  lastIngestion: string;
  languages: Array<{
    language: string;
    fileCount: number;
    chunkCount: number;
  }>;
  chunkTypes: Array<{
    type: string;
    count: number;
  }>;
  sizeBytes: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OpenCodebaseManagerInput {
  // No parameters required for opening the manager UI
}

export interface OpenCodebaseManagerOutput {
  url: string;
  message: string;
}

export interface ListFilesInput {
  codebaseName: string;
}

export interface ListFilesOutput {
  files: Array<{
    filePath: string;
    language: string;
    chunkCount: number;
    lastIngestion: string;
    sizeBytes: number;
    isTestFile: boolean;
    isLibraryFile: boolean;
  }>;
  codebaseName: string;
  totalFiles: number;
}

export interface UpdateCodebaseScanInput {
  name: string;
  verbose?: boolean;
}

export interface UpdateCodebaseScanOutput {
  name: string;
  path: string;
  filesScanned: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesUnchanged: number;
  chunksAdded: number;
  chunksDeleted: number;
  cacheCleared: boolean;
  addedFilePaths?: string[];
  modifiedFilePaths?: string[];
  deletedFilePaths?: string[];
  durationMs: number;
  message: string;
}

export interface GetChunkContentInput {
  codebaseName: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface GetChunkContentOutput {
  codebaseName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  chunkType: string;
  content: string;
  lineNumberDrift?: number;
  staleWarning?: string;
}

export interface GetFileContentInput {
  codebaseName: string;
  filePath: string;
}

export interface GetFileContentOutput {
  codebaseName: string;
  filePath: string;
  language: string;
  content: string;
  chunkCount: number;
  totalLines: number;
}

export interface GetAdjacentChunksInput {
  codebaseName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  before?: number;
  after?: number;
}
