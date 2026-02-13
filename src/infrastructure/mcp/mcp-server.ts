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
import type { Config } from '../../shared/types/index.js';
import type { CodebaseService } from '../../domains/codebase/codebase.service.js';
import type { SearchService } from '../../domains/search/search.service.js';
import {
  ALL_TOOL_SCHEMAS,
  LIST_CODEBASES_SCHEMA,
  SEARCH_CODEBASES_SCHEMA,
  GET_CODEBASE_STATS_SCHEMA,
  OPEN_CODEBASE_MANAGER_SCHEMA,
  LIST_FILES_SCHEMA,
  type SearchCodebasesInput,
  type GetCodebaseStatsInput,
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
  private config: Config;

  constructor(
    codebaseService: CodebaseService,
    searchService: SearchService,
    config: Config
  ) {
    this.codebaseService = codebaseService;
    this.searchService = searchService;
    this.config = config;

    // Initialize AJV for schema validation
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);

    // Create MCP server
    this.server = new Server(
      {
        name: '@teknologika/mcp-codebase-search',
        version: '0.1.0',
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

    // Format response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
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
