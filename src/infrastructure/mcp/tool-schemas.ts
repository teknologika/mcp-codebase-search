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
  description: 'List all indexed codebases with their metadata including name, path, chunk count, file count, last file modification timestamp, and supported languages.',
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
            lastIngested: {
              type: 'string',
              description: 'ISO 8601 timestamp of the most recent ingest or rescan',
              format: 'date-time',
            },
            lastModified: {
              type: 'string',
              description: 'ISO 8601 timestamp of the most recently modified indexed file',
              format: 'date-time',
            },
            lastScanAge: {
              type: 'number',
              description: 'Seconds since the last ingest or rescan completed',
              minimum: 0,
            },
            lastRescanChangedAt: {
              type: 'string',
              description: 'ISO 8601 timestamp of the most recent meaningful rescan',
              format: 'date-time',
            },
            lastRescanFilesChanged: {
              type: 'number',
              description: 'Total number of files changed in the most recent meaningful rescan',
              minimum: 0,
            },
            lastRescanFilesAdded: {
              type: 'number',
              description: 'Number of files added in the most recent meaningful rescan',
              minimum: 0,
            },
            lastRescanFilesModified: {
              type: 'number',
              description: 'Number of files modified in the most recent meaningful rescan',
              minimum: 0,
            },
            lastRescanFilesDeleted: {
              type: 'number',
              description: 'Number of files deleted in the most recent meaningful rescan',
              minimum: 0,
            },
            lastRescanChangedFilePaths: {
              type: 'array',
              description: 'Relative file paths changed by the most recent meaningful rescan',
              items: {
                type: 'string',
              },
            },
            languages: {
              type: 'array',
              description: 'List of programming languages detected in the codebase',
              items: {
                type: 'string',
              },
            },
          },
          required: ['name', 'path', 'chunkCount', 'fileCount', 'lastModified', 'languages'],
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
const SEARCH_LANGUAGE_ENUM = [
  'csharp',
  'go',
  'java',
  'javascript',
  'python',
  'svelte',
  'swift',
  'typescript',
  'vue',
  'html',
  'css',
  'scss',
  'zig',
  'json',
  'markdown',
  'yaml',
  'dockerfile',
  'plaintext',
] as const;

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
        enum: [...SEARCH_LANGUAGE_ENUM],
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
      query: {
        type: 'string',
        description: 'The search query that produced these results',
      },
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
              enum: [...SEARCH_LANGUAGE_ENUM],
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
      staleFiles: {
        type: 'array',
        description: 'Files in the results whose on-disk mtime is newer than the indexed file mtime',
        items: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Relative path to a stale file',
            },
            indexedAt: {
              type: 'string',
              description: 'Stored file mtime (ISO 8601) from the index',
              format: 'date-time',
            },
            modifiedAt: {
              type: 'string',
              description: 'Current on-disk mtime (ISO 8601)',
              format: 'date-time',
            },
            staleSecs: {
              type: 'number',
              description: 'How many seconds the file is newer than the indexed mtime',
              minimum: 0,
            },
          },
          required: ['filePath', 'indexedAt', 'modifiedAt', 'staleSecs'],
          additionalProperties: false,
        },
      },
    },
    required: ['query', 'results', 'totalResults', 'queryTime', 'staleFiles'],
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
      lastModified: {
        type: 'string',
        description: 'ISO 8601 timestamp of the most recently modified indexed file',
        format: 'date-time',
      },
      lastIngested: {
        type: 'string',
        description: 'ISO 8601 timestamp of the most recent ingest or rescan',
        format: 'date-time',
      },
      lastScanAge: {
        type: 'number',
        description: 'Seconds since the last ingest or rescan completed',
        minimum: 0,
      },
      lastRescanChangedAt: {
        type: 'string',
        description: 'ISO 8601 timestamp of the most recent meaningful rescan',
        format: 'date-time',
      },
      lastRescanFilesChanged: {
        type: 'number',
        description: 'Total number of files changed in the most recent meaningful rescan',
        minimum: 0,
      },
      lastRescanFilesAdded: {
        type: 'number',
        description: 'Number of files added in the most recent meaningful rescan',
        minimum: 0,
      },
      lastRescanFilesModified: {
        type: 'number',
        description: 'Number of files modified in the most recent meaningful rescan',
        minimum: 0,
      },
      lastRescanFilesDeleted: {
        type: 'number',
        description: 'Number of files deleted in the most recent meaningful rescan',
        minimum: 0,
      },
      lastRescanChangedFilePaths: {
        type: 'array',
        description: 'Relative file paths changed by the most recent meaningful rescan',
        items: {
          type: 'string',
        },
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
    required: ['name', 'path', 'chunkCount', 'fileCount', 'lastModified', 'languages', 'chunkTypes', 'sizeBytes'],
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
  description: 'List all files in a codebase with metadata including chunk count, language, size, and file modified timestamp. Useful for understanding codebase structure and finding specific files.',
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
            fileMtime: {
              type: 'string',
              description: 'ISO 8601 timestamp of file mtime on disk when indexed',
              format: 'date-time',
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
          required: ['filePath', 'language', 'chunkCount', 'fileMtime', 'sizeBytes', 'isTestFile', 'isLibraryFile'],
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
      request: {
        type: 'object',
        description: 'The input request that triggered the update',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the codebase to refresh',
          },
          verbose: {
            type: 'boolean',
            description: 'Whether verbose file path details were requested',
          },
        },
        required: ['name', 'verbose'],
        additionalProperties: false,
      },
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
      filesIndexed: {
        type: 'number',
        description: 'Number of unique files present in the index after the rescan',
        minimum: 0,
      },
      filesDropped: {
        type: 'number',
        description: 'Number of supported files that were scanned but did not end up indexed',
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
      droppedFilePaths: {
        type: 'array',
        description: 'File paths that were scanned but did not end up indexed (verbose mode only)',
        items: {
          type: 'string',
        },
      },
      durationMs: {
        type: 'number',
        description: 'Time taken to complete the refresh in milliseconds',
        minimum: 0,
      },
      lastChangedFiles: {
        type: 'number',
        description: 'Number of files changed in the most recent meaningful rescan',
        minimum: 0,
      },
      lastChangedAt: {
        type: 'string',
        description: 'Timestamp of the most recent meaningful rescan',
        format: 'date-time',
      },
      lastChangedFilePaths: {
        type: 'array',
        description: 'File paths from the most recent meaningful rescan',
        items: {
          type: 'string',
        },
      },
      message: {
        type: 'string',
        description: 'Status message about the operation',
      },
    },
    required: ['request', 'name', 'path', 'filesScanned', 'filesAdded', 'filesModified', 'filesDeleted', 'filesUnchanged', 'filesIndexed', 'filesDropped', 'chunksAdded', 'chunksDeleted', 'cacheCleared', 'durationMs', 'message', 'lastChangedFilePaths'],
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

export const DETECT_CHANGES_SCHEMA = {
  name: 'detect_changes',
  description:
    'Runs git diff on a codebase to find modified files and maps changes to ' +
    'indexed chunks. Returns affected files, chunk IDs, line ranges, and a ' +
    'risk classification (low / medium / high) based on how much of each file ' +
    'changed and whether the file is imported by many others.',
  inputSchema: {
    type: 'object',
    properties: {
      codebaseName: {
        type: 'string',
        description: 'Name of the indexed codebase to analyse.',
      },
      includeStagedChanges: {
        type: 'boolean',
        description:
          'If true, also include staged (git diff --cached) changes. Default false.',
      },
      baseRef: {
        type: 'string',
        description:
          'Git ref to diff against. Defaults to HEAD. Examples: "main", "HEAD~3".',
      },
    },
    required: ['codebaseName'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      codebaseName: {
        type: 'string',
        description: 'Name of the analysed codebase',
      },
      baseRef: {
        type: 'string',
        description: 'Git ref used as the diff base',
      },
      totalFilesChanged: {
        type: 'number',
        description: 'Total number of files reported by git diff',
        minimum: 0,
      },
      totalChunksAffected: {
        type: 'number',
        description: 'Total number of indexed chunks overlapping changed lines',
        minimum: 0,
      },
      files: {
        type: 'array',
        description: 'Changed files with indexed chunk overlap and risk details',
        items: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
            },
            changeType: {
              type: 'string',
              enum: ['modified', 'added', 'deleted'],
            },
            indexed: {
              type: 'boolean',
            },
            risk: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
            },
            changedLineRanges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  start: { type: 'number', minimum: 0 },
                  end: { type: 'number', minimum: 0 },
                },
                required: ['start', 'end'],
                additionalProperties: false,
              },
            },
            affectedChunks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  chunkId: { type: 'string' },
                  startLine: { type: 'number', minimum: 0 },
                  endLine: { type: 'number', minimum: 0 },
                  preview: { type: 'string' },
                },
                required: ['chunkId', 'startLine', 'endLine', 'preview'],
                additionalProperties: false,
              },
            },
          },
          required: ['filePath', 'changeType', 'indexed', 'risk', 'changedLineRanges', 'affectedChunks'],
          additionalProperties: false,
        },
      },
      error: {
        type: 'string',
        description: 'Recoverable error message when git diff cannot run',
      },
    },
    required: ['codebaseName', 'baseRef', 'totalFilesChanged', 'totalChunksAffected', 'files'],
    additionalProperties: false,
  },
} as const;

export const GET_SYMBOL_SCHEMA = {
  name: 'get_symbol',
  description:
    'Finds a named symbol (function, class, constant, type, interface, enum, ' +
    'variable) in an indexed codebase by exact or fuzzy name match. Returns ' +
    'the source code, file path, and line range. Prefer this over search_codebases ' +
    'when you already know the symbol name. Much more reliable than get_chunk_content ' +
    'for identifier lookup.',
  inputSchema: {
    type: 'object',
    properties: {
      codebaseName: {
        type: 'string',
        description: 'Name of the indexed codebase to search.',
      },
      symbolName: {
        type: 'string',
        description:
          'Exact or partial symbol name to find. Examples: "ALL_TOOL_SCHEMAS", ' +
          '"CodebaseService", "handleGetChunkContent", "MAX_CHUNK_SIZE". ' +
          'Case-insensitive substring match is used if no exact match is found.',
      },
      filePath: {
        type: 'string',
        description:
          'Optional. Restrict search to this file path (relative to codebase root ' +
          'or a substring of the path). Useful when the symbol name is common.',
      },
      matchMode: {
        type: 'string',
        enum: ['exact', 'prefix', 'contains'],
        description:
          'How to match the symbol name. "exact" is case-insensitive exact match. ' +
          '"prefix" matches names starting with symbolName. "contains" (default) ' +
          'matches names containing symbolName as a substring.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of matching symbols to return. Default 5, max 20.',
        minimum: 1,
        maximum: 20,
        default: 5,
      },
      includeContent: {
        type: 'boolean',
        description:
          'If true (default), include the full source text of each matched symbol. ' +
          'Set false to get only file paths and line ranges for a cheaper scan.',
        default: true,
      },
    },
    required: ['codebaseName', 'symbolName'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      codebaseName: {
        type: 'string',
        description: 'Name of the searched codebase.',
      },
      symbolName: {
        type: 'string',
        description: 'Symbol name supplied by the caller.',
      },
      matchMode: {
        type: 'string',
        enum: ['exact', 'prefix', 'contains'],
        description: 'Matching strategy used for this lookup.',
      },
      totalMatches: {
        type: 'number',
        description: 'Total number of matching chunks before truncation.',
        minimum: 0,
      },
      symbols: {
        type: 'array',
        description: 'Matching symbols ordered by definition quality and location.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            kind: { type: 'string', enum: ['definition', 'usage'] },
            filePath: { type: 'string' },
            startLine: { type: 'number', minimum: 0 },
            endLine: { type: 'number', minimum: 0 },
            chunkId: { type: 'string' },
            content: { type: 'string' },
            preview: { type: 'string' },
          },
          required: ['name', 'kind', 'filePath', 'startLine', 'endLine', 'chunkId', 'preview'],
          additionalProperties: false,
        },
      },
      warning: {
        type: 'string',
        description: 'Recoverable lookup warning, such as no definition found.',
      },
    },
    required: ['codebaseName', 'symbolName', 'matchMode', 'totalMatches', 'symbols'],
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
  DETECT_CHANGES_SCHEMA,
  GET_SYMBOL_SCHEMA,
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
    lastIngested?: string;
    lastModified: string;
    lastScanAge?: number;
    lastRescanChangedAt?: string;
    lastRescanFilesChanged?: number;
    lastRescanFilesAdded?: number;
    lastRescanFilesModified?: number;
    lastRescanFilesDeleted?: number;
    lastRescanChangedFilePaths?: string[];
    languages: string[];
  }>;
}

export interface SearchCodebasesInput {
  query: string;
  codebaseName?: string;
  language?: typeof SEARCH_LANGUAGE_ENUM[number];
  maxResults?: number;
  includeContent?: boolean;
  topContentResults?: number;
}

export interface SearchCodebasesOutput {
  query: string;
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
  staleFiles: Array<{
    filePath: string;
    indexedAt: string;
    modifiedAt: string;
    staleSecs: number;
  }>;
}

export interface GetCodebaseStatsInput {
  name: string;
}

export interface GetCodebaseStatsOutput {
  name: string;
  path: string;
  chunkCount: number;
  fileCount: number;
  lastIngested?: string;
  lastModified: string;
  lastScanAge?: number;
  lastRescanChangedAt?: string;
  lastRescanFilesChanged?: number;
  lastRescanFilesAdded?: number;
  lastRescanFilesModified?: number;
  lastRescanFilesDeleted?: number;
  lastRescanChangedFilePaths?: string[];
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
    fileMtime: string;
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
  request: {
    name: string;
    verbose: boolean;
  };
  name: string;
  path: string;
  filesScanned: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesUnchanged: number;
  filesIndexed: number;
  filesDropped: number;
  chunksAdded: number;
  chunksDeleted: number;
  cacheCleared: boolean;
  lastChangedFiles?: number;
  lastChangedAt?: string;
  lastChangedFilePaths: string[];
  addedFilePaths?: string[];
  modifiedFilePaths?: string[];
  deletedFilePaths?: string[];
  droppedFilePaths?: string[];
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

export interface DetectChangesInput {
  codebaseName: string;
  includeStagedChanges?: boolean;
  baseRef?: string;
}

export interface GetSymbolInput {
  codebaseName: string;
  symbolName: string;
  filePath?: string;
  matchMode?: 'exact' | 'prefix' | 'contains';
  maxResults?: number;
  includeContent?: boolean;
}

export interface DetectChangesOutput {
  codebaseName: string;
  baseRef: string;
  totalFilesChanged: number;
  totalChunksAffected: number;
  files: Array<{
    filePath: string;
    changeType: 'modified' | 'added' | 'deleted';
    indexed: boolean;
    risk: 'low' | 'medium' | 'high';
    changedLineRanges: Array<{ start: number; end: number }>;
    affectedChunks: Array<{
      chunkId: string;
      startLine: number;
      endLine: number;
      preview: string;
    }>;
  }>;
  error?: string;
}

export interface GetSymbolOutput {
  codebaseName: string;
  symbolName: string;
  matchMode: 'exact' | 'prefix' | 'contains';
  totalMatches: number;
  symbols: Array<{
    name: string;
    kind: 'definition' | 'usage';
    filePath: string;
    startLine: number;
    endLine: number;
    chunkId: string;
    content?: string;
    preview: string;
  }>;
  warning?: string;
}
