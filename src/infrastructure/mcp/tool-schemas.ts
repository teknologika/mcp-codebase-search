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
  description: 'Search indexed codebases using semantic search. Returns code chunks ranked by similarity to the query. Supports optional filters for codebase name, language, and maximum number of results.',
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
      },
      language: {
        type: 'string',
        description: 'Optional filter to search only for code in a specific language',
        enum: ['csharp', 'java', 'javascript', 'typescript', 'python'],
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 50)',
        minimum: 1,
        maximum: 200,
        default: 50,
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
              description: 'The actual code content of the chunk',
            },
            similarityScore: {
              type: 'number',
              description: 'Similarity score between 0 and 1 (higher is more similar)',
              minimum: 0,
              maximum: 1,
            },
            codebaseName: {
              type: 'string',
              description: 'Name of the codebase containing this chunk',
            },
          },
          required: [
            'filePath',
            'startLine',
            'endLine',
            'language',
            'chunkType',
            'content',
            'similarityScore',
            'codebaseName',
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
 * All tool schemas exported as an array for easy registration
 */
export const ALL_TOOL_SCHEMAS = [
  LIST_CODEBASES_SCHEMA,
  SEARCH_CODEBASES_SCHEMA,
  GET_CODEBASE_STATS_SCHEMA,
  OPEN_CODEBASE_MANAGER_SCHEMA,
] as const;

/**
 * Type definitions for tool inputs and outputs
 */

export interface ListCodebasesInput {
  // No parameters
}

export interface ListCodebasesOutput {
  codebases: Array<{
    name: string;
    path: string;
    chunkCount: number;
    fileCount: number;
    lastIngestion: string;
    languages: string[];
  }>;
}

export interface SearchCodebasesInput {
  query: string;
  codebaseName?: string;
  language?: 'csharp' | 'java' | 'javascript' | 'typescript' | 'python';
  maxResults?: number;
}

export interface SearchCodebasesOutput {
  results: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
    language: string;
    chunkType: string;
    content: string;
    similarityScore: number;
    codebaseName: string;
  }>;
  totalResults: number;
  queryTime: number;
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

export interface OpenCodebaseManagerInput {
  // No parameters
}

export interface OpenCodebaseManagerOutput {
  url: string;
  message: string;
}
