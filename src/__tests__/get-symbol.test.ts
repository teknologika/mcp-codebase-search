import { describe, expect, it, vi } from 'vitest';
import { CodebaseService } from '../domains/codebase/codebase.service.js';
import type { LanceDBClientWrapper } from '../infrastructure/lancedb/lancedb.client.js';
import { DEFAULT_CONFIG } from '../shared/config/config.js';

interface SymbolTestChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  chunkType: string;
  content: string;
}

function createService(rows: SymbolTestChunk[]): CodebaseService {
  const table = {
    query: vi.fn(() => ({
      toArray: vi.fn(async () => rows),
    })),
  };

  const lanceClient = {
    getOrCreateTable: vi.fn(async () => table),
  } as unknown as LanceDBClientWrapper;

  return new CodebaseService(lanceClient, DEFAULT_CONFIG);
}

describe('getSymbol', () => {
  it('classifies definition chunks ahead of usage chunks', async () => {
    const service = createService([
      {
        id: 'definition-chunk',
        filePath: 'src/infrastructure/mcp/tool-schemas.ts',
        startLine: 10,
        endLine: 13,
        language: 'typescript',
        chunkType: 'constant',
        content: 'export const ALL_TOOL_SCHEMAS = [\n  LIST_CODEBASES_SCHEMA,\n];',
      },
      {
        id: 'usage-chunk',
        filePath: 'src/usage.ts',
        startLine: 20,
        endLine: 22,
        language: 'typescript',
        chunkType: 'function',
        content: 'function register() {\n  ALL_TOOL_SCHEMAS.push(extraSchema);\n}',
      },
    ]);

    const result = await service.getSymbol({
      codebaseName: 'mcp-codebase-search',
      symbolName: 'ALL_TOOL_SCHEMAS',
      maxResults: 2,
    });

    expect(result.totalMatches).toBe(2);
    expect(result.symbols.map((symbol) => symbol.kind)).toEqual(['definition', 'usage']);
    expect(result.symbols[0]).toMatchObject({
      name: 'ALL_TOOL_SCHEMAS',
      filePath: 'src/infrastructure/mcp/tool-schemas.ts',
      chunkId: 'definition-chunk',
    });
  });

  it('exact mode excludes longer names that contain the symbol', async () => {
    const service = createService([
      {
        id: 'exact',
        filePath: 'src/schema.ts',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        chunkType: 'constant',
        content: 'export const ALL_TOOL_SCHEMAS = [];',
      },
      {
        id: 'extra',
        filePath: 'src/schema-extra.ts',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        chunkType: 'constant',
        content: 'export const ALL_TOOL_SCHEMAS_EXTRA = [];',
      },
    ]);

    const result = await service.getSymbol({
      codebaseName: 'mcp-codebase-search',
      symbolName: 'ALL_TOOL_SCHEMAS',
      matchMode: 'exact',
    });

    expect(result.totalMatches).toBe(1);
    expect(result.symbols[0].chunkId).toBe('exact');
  });

  it('prefix mode returns symbols whose names start with the query', async () => {
    const service = createService([
      {
        id: 'service',
        filePath: 'src/codebase.service.ts',
        startLine: 1,
        endLine: 3,
        language: 'typescript',
        chunkType: 'class',
        content: 'export class CodebaseService {}',
      },
      {
        id: 'service-impl',
        filePath: 'src/codebase-service-impl.ts',
        startLine: 1,
        endLine: 3,
        language: 'typescript',
        chunkType: 'class',
        content: 'export class CodebaseServiceImpl {}',
      },
    ]);

    const result = await service.getSymbol({
      codebaseName: 'mcp-codebase-search',
      symbolName: 'CodebaseService',
      matchMode: 'prefix',
    });

    expect(result.symbols.map((symbol) => symbol.name)).toEqual([
      'CodebaseService',
      'CodebaseServiceImpl',
    ]);
  });

  it('filePath restricts matches to a path substring', async () => {
    const service = createService([
      {
        id: 'included',
        filePath: 'src/infrastructure/mcp/tool-schemas.ts',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        chunkType: 'constant',
        content: 'export const ALL_TOOL_SCHEMAS = [];',
      },
      {
        id: 'excluded',
        filePath: 'src/other.ts',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        chunkType: 'constant',
        content: 'export const ALL_TOOL_SCHEMAS = [];',
      },
    ]);

    const result = await service.getSymbol({
      codebaseName: 'mcp-codebase-search',
      symbolName: 'ALL_TOOL_SCHEMAS',
      filePath: 'tool-schemas.ts',
    });

    expect(result.totalMatches).toBe(1);
    expect(result.symbols[0].chunkId).toBe('included');
  });

  it('omits content when includeContent is false', async () => {
    const service = createService([
      {
        id: 'definition',
        filePath: 'src/constants.ts',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        chunkType: 'constant',
        content: 'export const MAX_RETRIES = 3;',
      },
    ]);

    const result = await service.getSymbol({
      codebaseName: 'mcp-codebase-search',
      symbolName: 'MAX_RETRIES',
      includeContent: false,
    });

    expect(result.symbols[0]).not.toHaveProperty('content');
    expect(result.symbols[0].preview).toBe('export const MAX_RETRIES = 3;');
  });

  it('returns an empty result for unknown symbols', async () => {
    const service = createService([
      {
        id: 'definition',
        filePath: 'src/constants.ts',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        chunkType: 'constant',
        content: 'export const MAX_RETRIES = 3;',
      },
    ]);

    const result = await service.getSymbol({
      codebaseName: 'mcp-codebase-search',
      symbolName: 'DOES_NOT_EXIST',
    });

    expect(result.totalMatches).toBe(0);
    expect(result.symbols).toEqual([]);
    expect(result.warning).toBeUndefined();
  });
});
