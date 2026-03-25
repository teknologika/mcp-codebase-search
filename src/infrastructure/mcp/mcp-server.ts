/**
 * MCP Server Implementation
 * 
 * Implements the Model Context Protocol server with stdio transport.
 * Exposes tools for codebase search and management.
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 11.3, 15.1, 15.2, 15.3, 15.4, 15.5
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import AjvModule, { type ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import type { Config } from '../../shared/types/index.js';
import type { CodebaseService } from '../../domains/codebase/codebase.service.js';
import type { SearchService } from '../../domains/search/search.service.js';
import type { IngestionService } from '../../domains/ingestion/ingestion.service.js';
import {
  ALL_TOOL_SCHEMAS,
  LIST_CODEBASES_SCHEMA,
  SEARCH_CODEBASES_SCHEMA,
  GET_CODEBASE_STATS_SCHEMA,
  OPEN_CODEBASE_MANAGER_SCHEMA,
  LIST_FILES_SCHEMA,
  UPDATE_CODEBASE_SCAN_SCHEMA,
  GET_CHUNK_CONTENT_SCHEMA,
  GET_FILE_CONTENT_SCHEMA,
  GET_ADJACENT_CHUNKS_SCHEMA,
  type SearchCodebasesInput,
  type GetCodebaseStatsInput,
  type GetChunkContentInput,
  type GetFileContentInput,
  type GetAdjacentChunksInput,
} from './tool-schemas.js';

// Silent logger for MCP server - no logging to avoid interfering with stdio JSON-RPC
const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
} as any;

const execAsync = promisify(exec);

// Get the constructors - handle both ESM and CJS
const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

/**
 * MCP error codes
 */
enum MCPErrorCode {
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
}

/**
 * MCP Server class
 */
export class MCPServer {
  private server: Server;
  private ajv: InstanceType<typeof Ajv>;
  private codebaseService: CodebaseService;
  private searchService: SearchService;
  private ingestionService: IngestionService;
  private config: Config;

  constructor(
    codebaseService: CodebaseService,
    searchService: SearchService,
    ingestionService: IngestionService,
    config: Config
  ) {
    this.codebaseService = codebaseService;
    this.searchService = searchService;
    this.ingestionService = ingestionService;
    this.config = config;

    // Initialize AJV for schema validation
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);

    // Create MCP server
    this.server = new Server(
      {
        name: '@teknologika/mcp-codebase-search',
        version: '0.1.12',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = ALL_TOOL_SCHEMAS.map((schema) => ({
        name: schema.name,
        description: schema.description,
        inputSchema: schema.inputSchema as Tool['inputSchema'],
      }));

      return { tools };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      try {
        // Route to appropriate tool handler
        switch (toolName) {
          case 'list_codebases':
            return await this.handleListCodebases(args);
          case 'search_codebases':
            return await this.handleSearchCodebases(args);
          case 'get_codebase_stats':
            return await this.handleGetCodebaseStats(args);
          case 'open_codebase_manager':
            return await this.handleOpenCodebaseManager(args);
          case 'list_files':
            return await this.handleListFiles(args);
          case 'update_codebase_scan':
            return await this.handleUpdateCodebaseScan(args);
          case 'get_chunk_content':
            return await this.handleGetChunkContent(args);
          case 'get_file_content':
            return await this.handleGetFileContent(args);
          case 'get_adjacent_chunks':
            return await this.handleGetAdjacentChunks(args);
          default:
            throw this.createError(
              MCPErrorCode.TOOL_NOT_FOUND,
              `Tool '${toolName}' not found`
            );
        }
      } catch (error) {
        // If it's already an MCP error, rethrow it
        if (this.isMCPError(error)) {
          throw error;
        }

        // Otherwise, wrap it in an internal error
        throw this.createError(
          MCPErrorCode.INTERNAL_ERROR,
          error instanceof Error ? error.message : String(error),
          error
        );
      }
    });
  }

  /**
   * Handle list_codebases tool call
   */
  private async handleListCodebases(args: unknown) {
    // Validate input
    this.validateInput(LIST_CODEBASES_SCHEMA.inputSchema, args);

    // Call service
    const codebases = await this.codebaseService.listCodebases();

    // Format response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ codebases }, null, 2),
        },
      ],
    };
  }

  /**
   * Handle search_codebases tool call
   */
  private async handleSearchCodebases(args: unknown) {
    // Validate input
    this.validateInput(SEARCH_CODEBASES_SCHEMA.inputSchema, args);
    const input = args as SearchCodebasesInput;

    // Call service
    const results = await this.searchService.search({
      query: input.query,
      codebaseName: input.codebaseName,
      language: input.language,
      maxResults: input.maxResults,
    });
    const staleFiles = await this.getStaleFiles(results.results, input.codebaseName);

    const topN = input.topContentResults ?? 0;
    const useIncludeContent = input.includeContent ?? false;

    const formattedResults = results.results.map((result, index) => {
      const includeThisContent = useIncludeContent || index < topN;
      if (includeThisContent) {
        return result;
      }
      // Return the metadata-only shape expected by the tool schema.
      return {
        filePath: result.filePath,
        startLine: result.startLine,
        endLine: result.endLine,
        language: result.language,
        chunkType: result.chunkType,
        similarityScore: result.similarityScore,
      };
    });

    const payload = {
      results: formattedResults,
      totalResults: results.totalResults,
      queryTime: results.queryTime,
      staleFiles,
    };
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  }

  /**
   * Handle get_codebase_stats tool call
   */
  private async handleGetCodebaseStats(args: unknown) {
    // Validate input
    this.validateInput(GET_CODEBASE_STATS_SCHEMA.inputSchema, args);
    const input = args as GetCodebaseStatsInput;

    try {
      // Call service
      const stats = await this.codebaseService.getCodebaseStats(input.name);

      // Format response
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    } catch (error) {
      // Check if it's a not found error
      if (
        error instanceof Error &&
        error.message.includes('not found')
      ) {
        throw this.createError(
          MCPErrorCode.NOT_FOUND,
          `Codebase '${input.name}' not found`
        );
      }
      throw error;
    }
  }

  /**
   * Handle open_codebase_manager tool call
   */
  private async handleOpenCodebaseManager(args: unknown) {
    // Validate input
    this.validateInput(OPEN_CODEBASE_MANAGER_SCHEMA.inputSchema, args);

    const url = `http://${this.config.server.host}:${this.config.server.port}`;

    try {
      // Check if manager server is already running
      const isRunning = await this.checkServerRunning(url);
      
      if (!isRunning) {
        // Launch the manager server in the background
        await this.launchManagerServer();
        
        // Wait a moment for the server to start
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Launch browser
      await this.openBrowser(url);

      // Format response
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                url,
                message: `Opening codebase manager at ${url}`,
                serverStarted: !isRunning,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      // Still return success with URL
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                url,
                message: `Codebase manager is available at ${url} (failed to open browser automatically)`,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  /**
   * Handle list_files tool call
   */
  private async handleListFiles(args: unknown) {
    // Validate input
    this.validateInput(LIST_FILES_SCHEMA.inputSchema, args);

    const { codebaseName } = args as { codebaseName: string };

    try {
      const files = await this.codebaseService.listFiles(codebaseName);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                files,
                codebaseName,
                totalFiles: files.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw this.createError(
        MCPErrorCode.INTERNAL_ERROR,
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Handle update_codebase_scan tool call
   */
  private async handleUpdateCodebaseScan(args: unknown) {
    // Validate input
    this.validateInput(UPDATE_CODEBASE_SCAN_SCHEMA.inputSchema, args);

    const { name, verbose = false } = args as { name: string; verbose?: boolean };

    try {
      // Get the codebase to find its path
      const codebases = await this.codebaseService.listCodebases();
      const codebase = codebases.find(cb => cb.name === name);

      if (!codebase) {
        throw this.createError(
          MCPErrorCode.INVALID_PARAMETERS,
          `Codebase '${name}' not found`
        );
      }

      // Use rescanCodebase for incremental updates (safer than full re-ingestion)
      const result = await this.ingestionService.rescanCodebase(
        name,
        codebase.path
      );
      this.searchService.clearCache();

      const response = {
        name,
        path: codebase.path,
        filesScanned: result.filesScanned,
        filesAdded: result.filesAdded,
        filesModified: result.filesModified,
        filesDeleted: result.filesDeleted,
        filesUnchanged: result.filesUnchanged,
        chunksAdded: result.chunksAdded,
        chunksDeleted: result.chunksDeleted,
        durationMs: result.durationMs,
        cacheCleared: true,
        message: `Successfully refreshed codebase '${name}': ${result.filesAdded} added, ${result.filesModified} modified, ${result.filesDeleted} deleted, ${result.filesUnchanged} unchanged`,
        ...(verbose ? {
          addedFilePaths: result.addedFilePaths || [],
          modifiedFilePaths: result.modifiedFilePaths || [],
          deletedFilePaths: result.deletedFilePaths || [],
        } : {}),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      throw this.createError(
        MCPErrorCode.INTERNAL_ERROR,
        `Failed to update codebase scan: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Handle get_chunk_content tool call
   */
  private async handleGetChunkContent(args: unknown) {
    // Validate input
    this.validateInput(GET_CHUNK_CONTENT_SCHEMA.inputSchema, args);
    const input = args as GetChunkContentInput;

    try {
      // Call service to get chunk content
      const chunk = await this.codebaseService.getChunkContent(
        input.codebaseName,
        input.filePath,
        input.startLine,
        input.endLine
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(chunk, null, 2),
          },
        ],
      };
    } catch (error) {
      // Return a recoverable response instead of throwing.
      // Throwing produces "Tool execution failed" which gives the LLM nothing to act on.
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'chunk_not_found',
            message,
            recovery: `The requested line range ${input.startLine}–${input.endLine} does not match any indexed chunk in '${input.filePath}'. ` +
              `Use search_codebases with a query describing the code you want to find in this file to get valid line numbers, ` +
              `then call get_chunk_content with those line numbers. ` +
              `Alternatively use get_file_content if the file is small (check chunkCount via list_files first).`,
            requestedRange: { startLine: input.startLine, endLine: input.endLine },
            filePath: input.filePath,
            codebaseName: input.codebaseName,
          }, null, 2),
        }],
      };
    }
  }

  /**
   * Handle get_file_content tool call
   */
  private async handleGetFileContent(args: unknown) {
    let input: GetFileContentInput | undefined;

    try {
      // Validate input
      this.validateInput(GET_FILE_CONTENT_SCHEMA.inputSchema, args);
      input = args as GetFileContentInput;

      // Call service to get file content
      const file = await this.codebaseService.getFileContent(
        input.codebaseName,
        input.filePath
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(file, null, 2),
          },
        ],
      };
    } catch (error) {
      // Return a recoverable response instead of throwing.
      const message = error instanceof Error ? error.message : String(error);
      const fallbackInput = args as any;
      const filePath = input?.filePath ?? fallbackInput?.filePath ?? null;
      const codebaseName = input?.codebaseName ?? fallbackInput?.codebaseName ?? null;

      let errorCode = 'file_retrieval_failed';
      let recovery =
        `Failed to retrieve '${filePath}' as a single response — the file may be too large. ` +
        `Use search_codebases with a query describing the specific code you need in this file, ` +
        `then call get_chunk_content with the line ranges from those results. ` +
        `Call list_files to check the file's chunkCount before attempting get_file_content on large files.`;

      if (/validation|required|must/i.test(message)) {
        errorCode = 'invalid_input';
        recovery =
          `Provide valid get_file_content arguments. ` +
          `Ensure both codebaseName and filePath are present and match the tool schema.`;
      } else if (/Codebase '.*' not found/i.test(message) && !/File not found:/i.test(message)) {
        errorCode = 'codebase_not_found';
        recovery =
          `The requested codebase was not found. ` +
          `Call list_codebases to find a valid name, then retry get_file_content.`;
      } else if (/File not found:/i.test(message)) {
        errorCode = 'file_not_found';
        recovery =
          `The file path was not found in the selected codebase. ` +
          `Check that filePath is relative to the codebase root, then use list_files or search_codebases to locate the correct path.`;
      } else if (/File content not available/i.test(message)) {
        errorCode = 'file_content_unavailable';
        recovery =
          `The file exists in the index but full file content is unavailable. ` +
          `Re-ingest with storeFullFiles enabled, or use search_codebases plus get_chunk_content to retrieve targeted sections.`;
      } else if (/does not exist or is not accessible/i.test(message)) {
        errorCode = 'codebase_path_missing';
        recovery =
          `The indexed codebase path is no longer accessible on disk. ` +
          `Re-index the codebase (or run update_codebase_scan after restoring the path) and retry.`;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: errorCode,
            message,
            recovery,
            filePath,
            codebaseName,
          }, null, 2),
        }],
      };
    }
  }

  /**
   * Handle get_adjacent_chunks tool call
   */
  private async handleGetAdjacentChunks(args: unknown) {
    this.validateInput(GET_ADJACENT_CHUNKS_SCHEMA.inputSchema, args);
    const input = args as GetAdjacentChunksInput;

    try {
      const result = await this.codebaseService.getAdjacentChunks(
        input.codebaseName,
        input.filePath,
        input.startLine,
        input.endLine,
        input.before ?? 1,
        input.after ?? 1
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'adjacent_chunks_failed',
            message,
            recovery: `Could not retrieve adjacent chunks for '${input.filePath}' around lines ${input.startLine}–${input.endLine}. ` +
              `Use search_codebases to find nearby chunks in this file by describing the surrounding code.`,
            filePath: input.filePath,
            codebaseName: input.codebaseName,
            requestedRange: { startLine: input.startLine, endLine: input.endLine },
          }, null, 2),
        }],
      };
    }
  }

  private async getStaleFiles(
    results: Array<{ filePath: string; codebaseName?: string }>,
    defaultCodebaseName?: string
  ): Promise<Array<{
    filePath: string;
    indexedAt: string;
    modifiedAt: string;
    staleSecs: number;
  }>> {
    if (results.length === 0) {
      return [];
    }

    try {
      const codebases = await this.codebaseService.listCodebases();
      const codebasePathByName = new Map(codebases.map(cb => [cb.name, cb.path]));
      const fileMtimeByCodebase = new Map<string, Map<string, string>>();

      const codebaseNames = new Set<string>();
      for (const result of results) {
        const codebaseName = result.codebaseName || defaultCodebaseName;
        if (codebaseName) {
          codebaseNames.add(codebaseName);
        }
      }

      for (const codebaseName of codebaseNames) {
        try {
          const files = await this.codebaseService.listFiles(codebaseName);
          fileMtimeByCodebase.set(
            codebaseName,
            new Map(files.map(file => [file.filePath, file.fileMtime]))
          );
        } catch {
          // Ignore file-level stale detection for codebases we can't resolve here.
        }
      }

      const staleFiles: Array<{
        filePath: string;
        indexedAt: string;
        modifiedAt: string;
        staleSecs: number;
      }> = [];
      const seen = new Set<string>();

      for (const result of results) {
        const codebaseName = result.codebaseName || defaultCodebaseName;
        if (!codebaseName) {
          continue;
        }

        const dedupeKey = `${codebaseName}::${result.filePath}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);

        const codebasePath = codebasePathByName.get(codebaseName);
        const fileMtimes = fileMtimeByCodebase.get(codebaseName);
        const indexedAt = fileMtimes?.get(result.filePath) || '';
        if (!codebasePath || !indexedAt) {
          continue;
        }

        const indexedAtMs = Date.parse(indexedAt);
        if (Number.isNaN(indexedAtMs)) {
          continue;
        }

        const absolutePath = `${codebasePath}/${result.filePath}`;

        try {
          const currentStats = await stat(absolutePath);
          const modifiedAt = currentStats.mtime.toISOString();
          const modifiedAtMs = Date.parse(modifiedAt);
          if (Number.isNaN(modifiedAtMs) || modifiedAtMs <= indexedAtMs) {
            continue;
          }

          staleFiles.push({
            filePath: result.filePath,
            indexedAt,
            modifiedAt,
            staleSecs: Math.floor((modifiedAtMs - indexedAtMs) / 1000),
          });
        } catch {
          // File could be deleted/moved; skip stale check for this entry.
        }
      }

      return staleFiles;
    } catch {
      return [];
    }
  }

  /**
   * Check if the manager server is running
   */
  private async checkServerRunning(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Launch the manager server in the background
   */
  private async launchManagerServer(): Promise<void> {
    const { spawn } = await import('node:child_process');
    
    // Find the manager command
    const managerCommand = 'mcp-codebase-manager';
    
    // Spawn the manager server as a detached background process
    const child = spawn(managerCommand, [], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    
    // Unref so the parent process can exit independently
    child.unref();
  }

  /**
   * Open URL in default browser
   */
  private async openBrowser(url: string): Promise<void> {
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    try {
      await execAsync(command);
    } catch (error: unknown) {
      throw new Error(
        `Failed to open browser: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate input against schema
   */
  private validateInput(schema: object, input: unknown): void {
    const validate: ValidateFunction = this.ajv.compile(schema);
    const valid = validate(input);

    if (!valid) {
      const errors = validate.errors || [];
      const errorMessages = errors.map(
        (err) => `${err.instancePath} ${err.message}`
      );

      throw this.createError(
        MCPErrorCode.INVALID_PARAMETERS,
        `Invalid parameters: ${errorMessages.join(', ')}`,
        errors
      );
    }
  }

  /**
   * Create MCP error
   */
  private createError(
    code: MCPErrorCode,
    message: string,
    data?: unknown
  ): Error {
    const error = new Error(message) as Error & { code: string; data?: unknown };
    error.code = code;
    error.data = data;
    return error;
  }

  /**
   * Check if error is an MCP error
   */
  private isMCPError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      Object.values(MCPErrorCode).includes((error as any).code)
    );
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Keep the process alive by returning a promise that never resolves
    // The stdio transport will handle communication via stdin/stdout
    // The process will exit when SIGINT/SIGTERM is received (handled in main)
    return new Promise(() => {
      // This promise intentionally never resolves to keep the process alive
      // The shutdown handlers in the main entry point will handle cleanup
    });
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    await this.server.close();
  }
}
