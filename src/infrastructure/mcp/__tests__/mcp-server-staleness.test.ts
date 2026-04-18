/**
 * Unit tests for MCP server staleness warnings
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPServer } from '../mcp-server.js';
import { DEFAULT_CONFIG } from '../../../shared/config/config.js';
import { stat } from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}));

describe('MCPServer stale warning behavior', () => {
  let server: MCPServer;
  let mockCodebaseService: {
    listCodebases: ReturnType<typeof vi.fn>;
    listFiles: ReturnType<typeof vi.fn>;
    getChunkContent: ReturnType<typeof vi.fn>;
    getFileContent: ReturnType<typeof vi.fn>;
    getAdjacentChunks: ReturnType<typeof vi.fn>;
  };
  let mockSearchService: { search: ReturnType<typeof vi.fn>; clearCache: ReturnType<typeof vi.fn> };
  let mockIngestionService: { rescanCodebase: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockCodebaseService = {
      listCodebases: vi.fn(),
      listFiles: vi.fn(),
      getChunkContent: vi.fn(),
      getFileContent: vi.fn(),
      getAdjacentChunks: vi.fn(),
    };

    mockSearchService = {
      search: vi.fn().mockResolvedValue({
        query: 'test query',
        results: [],
        totalResults: 0,
        queryTime: 1,
      }),
      clearCache: vi.fn(),
    };

    mockIngestionService = {
      rescanCodebase: vi.fn(),
    };
    server = new MCPServer(
      mockCodebaseService as any,
      mockSearchService as any,
      mockIngestionService as any,
      DEFAULT_CONFIG
    );

    vi.mocked(stat).mockReset();
  });

  it('should include an empty staleFiles array when results are fresh', async () => {
    const indexedAt = new Date('2026-03-25T10:00:00.000Z');
    mockCodebaseService.listCodebases.mockResolvedValue([
      {
        name: 'test-project',
        path: '/repo/test-project',
      },
    ]);
    mockCodebaseService.listFiles.mockResolvedValue([
      {
        filePath: 'src/a.ts',
        fileMtime: indexedAt.toISOString(),
      },
    ]);
    mockSearchService.search.mockResolvedValue({
      query: 'test query',
      results: [
        {
          filePath: 'src/a.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          chunkType: 'function',
          similarityScore: 0.9,
          codebaseName: 'test-project',
        },
      ],
      totalResults: 1,
      queryTime: 1,
    });
    vi.mocked(stat).mockResolvedValue({
      mtime: new Date('2026-03-25T10:00:00.000Z'),
    } as any);

    const response = await (server as any).handleSearchCodebases({
      query: 'test query',
      codebaseName: 'test-project',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).toHaveProperty('staleFiles');
    expect(payload.staleFiles).toEqual([]);
  });

  it('should include stale file entries when disk mtime is newer than indexed mtime', async () => {
    const indexedAt = new Date('2026-03-25T10:00:00.000Z');
    const modifiedAt = new Date('2026-03-25T10:37:18.000Z');
    mockCodebaseService.listCodebases.mockResolvedValue([
      {
        name: 'test-project',
        path: '/repo/test-project',
      },
    ]);
    mockCodebaseService.listFiles.mockResolvedValue([
      {
        filePath: 'src/a.ts',
        fileMtime: indexedAt.toISOString(),
      },
    ]);
    mockSearchService.search.mockResolvedValue({
      results: [
        {
          filePath: 'src/a.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          chunkType: 'function',
          similarityScore: 0.9,
          codebaseName: 'test-project',
        },
      ],
      totalResults: 1,
      queryTime: 1,
    });
    vi.mocked(stat).mockResolvedValue({ mtime: modifiedAt } as any);

    const response = await (server as any).handleSearchCodebases({
      query: 'test query',
      codebaseName: 'test-project',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload.query).toBe('test query');
    expect(payload.staleFiles).toEqual([
      {
        filePath: 'src/a.ts',
        indexedAt: indexedAt.toISOString(),
        modifiedAt: modifiedAt.toISOString(),
        staleSecs: Math.floor((modifiedAt.getTime() - indexedAt.getTime()) / 1000),
      },
    ]);
  });

  it('should ignore files with missing indexed mtime values', async () => {
    mockCodebaseService.listCodebases.mockResolvedValue([
      {
        name: 'test-project',
        path: '/repo/test-project',
      },
    ]);
    mockCodebaseService.listFiles.mockResolvedValue([
      {
        filePath: 'src/a.ts',
        fileMtime: '',
      },
    ]);
    mockSearchService.search.mockResolvedValue({
      query: 'test query',
      results: [
        {
          filePath: 'src/a.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          chunkType: 'function',
          similarityScore: 0.9,
          codebaseName: 'test-project',
        },
      ],
      totalResults: 1,
      queryTime: 1,
    });
    vi.mocked(stat).mockResolvedValue({ mtime: new Date('2026-03-25T11:00:00.000Z') } as any);

    const response = await (server as any).handleSearchCodebases({
      query: 'test query',
      codebaseName: 'test-project',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload.staleFiles).toEqual([]);
  });

  it('should include only the top N content results when requested', async () => {
    mockCodebaseService.listCodebases.mockResolvedValue([
      {
        name: 'test-project',
        path: '/repo/test-project',
      },
    ]);
    mockCodebaseService.listFiles.mockResolvedValue([]);

    mockSearchService.search.mockResolvedValue({
      query: 'test query',
      results: [
        {
          filePath: 'src/a.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          chunkType: 'function',
          similarityScore: 0.99,
          content: 'content-a',
          codebaseName: 'test-project',
        },
        {
          filePath: 'src/b.ts',
          startLine: 11,
          endLine: 20,
          language: 'typescript',
          chunkType: 'function',
          similarityScore: 0.98,
          content: 'content-b',
          codebaseName: 'test-project',
        },
        {
          filePath: 'src/c.ts',
          startLine: 21,
          endLine: 30,
          language: 'typescript',
          chunkType: 'function',
          similarityScore: 0.97,
          content: 'content-c',
          codebaseName: 'test-project',
        },
      ],
      totalResults: 3,
      queryTime: 3,
    });

    const response = await (server as any).handleSearchCodebases({
      query: 'test query',
      codebaseName: 'test-project',
      topContentResults: 2,
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload.results[0]).toHaveProperty('content', 'content-a');
    expect(payload.results[1]).toHaveProperty('content', 'content-b');
    expect(payload.results[2]).not.toHaveProperty('content');
    expect(payload.results[2]).not.toHaveProperty('codebaseName');
  });

  it('should return adjacent chunks through the dedicated tool handler', async () => {
    mockCodebaseService.getAdjacentChunks.mockResolvedValue({
      before: [
        {
          startLine: 1,
          endLine: 10,
          chunkType: 'method_part_1',
          content: 'before chunk',
        },
      ],
      reference: {
        startLine: 11,
        endLine: 20,
        chunkType: 'method_part_2',
      },
      after: [
        {
          startLine: 21,
          endLine: 30,
          chunkType: 'method_part_3',
          content: 'after chunk',
        },
      ],
    });

    const response = await (server as any).handleGetAdjacentChunks({
      codebaseName: 'test-project',
      filePath: 'src/test.ts',
      startLine: 11,
      endLine: 20,
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload.before).toHaveLength(1);
    expect(payload.reference).toMatchObject({
      startLine: 11,
      endLine: 20,
      chunkType: 'method_part_2',
    });
    expect(payload.after).toHaveLength(1);
  });

  it('should expose indexed and dropped file counts in update_codebase_scan responses', async () => {
    mockCodebaseService.listCodebases.mockResolvedValue([
      {
        name: 'test-project',
        path: '/repo/test-project',
      },
    ]);
    mockIngestionService.rescanCodebase.mockResolvedValue({
      codebaseName: 'test-project',
      filesScanned: 24,
      filesAdded: 7,
      filesModified: 0,
      filesDeleted: 0,
      filesUnchanged: 17,
      filesIndexed: 17,
      filesDropped: 7,
      chunksAdded: 47,
      chunksDeleted: 0,
      durationMs: 117,
      lastChangedFiles: 7,
      lastChangedAt: '2026-04-10T02:00:00.000Z',
      lastChangedFilePaths: ['src/a.ts', 'src/b.ts'],
      addedFilePaths: ['config.example.json'],
      modifiedFilePaths: [],
      deletedFilePaths: [],
      droppedFilePaths: [
        'config.example.json',
        'docs/chisel-knowledge-mcp.md',
        'src/domains/workspace/inbox-index.ts',
        'src/domains/workspace/workspace.service.ts',
        'src/index.ts',
        'src/infrastructure/mcp/mcp-server.ts',
        'src/infrastructure/mcp/tool-schemas.ts',
      ],
    });

    const response = await (server as any).handleUpdateCodebaseScan({
      name: 'test-project',
      verbose: true,
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).toMatchObject({
      request: {
        name: 'test-project',
        verbose: true,
      },
      name: 'test-project',
      path: '/repo/test-project',
      filesScanned: 24,
      filesIndexed: 17,
      filesDropped: 7,
      lastChangedFiles: 7,
      lastChangedAt: '2026-04-10T02:00:00.000Z',
      lastChangedFilePaths: ['src/a.ts', 'src/b.ts'],
      cacheCleared: true,
    });
    expect(payload.message).toContain('17 indexed');
    expect(payload.message).toContain('7 dropped');
    expect(payload.lastChangedFilePaths).toEqual(['src/a.ts', 'src/b.ts']);
    expect(payload.droppedFilePaths).toEqual([
      'config.example.json',
      'docs/chisel-knowledge-mcp.md',
      'src/domains/workspace/inbox-index.ts',
      'src/domains/workspace/workspace.service.ts',
      'src/index.ts',
      'src/infrastructure/mcp/mcp-server.ts',
      'src/infrastructure/mcp/tool-schemas.ts',
    ]);
    expect(mockSearchService.clearCache).toHaveBeenCalledTimes(1);
  });

  it('should surface the last meaningful change when a follow-up rescan finds no changes', async () => {
    mockCodebaseService.listCodebases.mockResolvedValue([
      {
        name: 'test-project',
        path: '/repo/test-project',
      },
    ]);
    mockIngestionService.rescanCodebase.mockResolvedValue({
      codebaseName: 'test-project',
      filesScanned: 24,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesUnchanged: 24,
      filesIndexed: 24,
      filesDropped: 0,
      chunksAdded: 0,
      chunksDeleted: 0,
      durationMs: 84,
      lastChangedFiles: 7,
      lastChangedAt: '2026-04-10T02:00:00.000Z',
      lastChangedFilePaths: ['src/changed-one.ts', 'src/changed-two.ts'],
      addedFilePaths: [],
      modifiedFilePaths: [],
      deletedFilePaths: [],
      droppedFilePaths: [],
    });

    const response = await (server as any).handleUpdateCodebaseScan({
      name: 'test-project',
      verbose: false,
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).toMatchObject({
      request: {
        name: 'test-project',
        verbose: false,
      },
      name: 'test-project',
      path: '/repo/test-project',
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      lastChangedFiles: 7,
      lastChangedAt: '2026-04-10T02:00:00.000Z',
      lastChangedFilePaths: ['src/changed-one.ts', 'src/changed-two.ts'],
      cacheCleared: true,
    });
    expect(payload.message).toContain('0 added');
    expect(payload.message).toContain('Last meaningful change: 7 files');
    expect(payload.message).toContain('Files: src/changed-one.ts, src/changed-two.ts');
    expect(payload.lastChangedFilePaths).toEqual(['src/changed-one.ts', 'src/changed-two.ts']);
    expect(mockSearchService.clearCache).toHaveBeenCalledTimes(1);
  });

  it('should return a recoverable chunk error response', async () => {
    mockCodebaseService.getChunkContent.mockRejectedValue(new Error('missing chunk'));

    const response = await (server as any).handleGetChunkContent({
      codebaseName: 'test-project',
      filePath: 'src/test.ts',
      startLine: 10,
      endLine: 20,
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).toMatchObject({
      error: 'chunk_not_found',
      message: 'missing chunk',
      requestedRange: { startLine: 10, endLine: 20 },
      filePath: 'src/test.ts',
      codebaseName: 'test-project',
    });
    expect(payload.recovery).toContain('search_codebases');
  });

  it('should return a recoverable file error response', async () => {
    mockCodebaseService.getFileContent.mockRejectedValue(new Error('file too large'));

    const response = await (server as any).handleGetFileContent({
      codebaseName: 'test-project',
      filePath: 'src/test.ts',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).toMatchObject({
      error: 'file_retrieval_failed',
      message: 'file too large',
      filePath: 'src/test.ts',
      codebaseName: 'test-project',
    });
    expect(payload.recovery).toContain('chunkCount');
  });

  it('should return invalid_input when filePath is missing', async () => {
    const response = await (server as any).handleGetFileContent({
      codebaseName: 'test-project',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload.error).toBe('invalid_input');
    expect(payload.message).toMatch(/required|must/i);
    expect(payload).toHaveProperty('filePath');
    expect(payload).toHaveProperty('codebaseName', 'test-project');
  });

  it('should classify file not found errors as file_not_found', async () => {
    mockCodebaseService.getFileContent.mockRejectedValue(
      new Error("File not found: src/missing.ts in codebase 'test-project'")
    );

    const response = await (server as any).handleGetFileContent({
      codebaseName: 'test-project',
      filePath: 'src/missing.ts',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).toMatchObject({
      error: 'file_not_found',
      filePath: 'src/missing.ts',
      codebaseName: 'test-project',
    });
    expect(payload.recovery).toContain('list_files');
  });

  it('should classify missing codebase errors as codebase_not_found', async () => {
    mockCodebaseService.getFileContent.mockRejectedValue(
      new Error("Codebase 'ghost-project' not found")
    );

    const response = await (server as any).handleGetFileContent({
      codebaseName: 'ghost-project',
      filePath: 'src/test.ts',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).toMatchObject({
      error: 'codebase_not_found',
      filePath: 'src/test.ts',
      codebaseName: 'ghost-project',
    });
    expect(payload.recovery).toContain('list_codebases');
  });

  it('should classify missing full content errors as file_content_unavailable', async () => {
    mockCodebaseService.getFileContent.mockRejectedValue(
      new Error(
        'File content not available in database for src/test.ts. Re-ingest the codebase with storeFullFiles enabled.'
      )
    );

    const response = await (server as any).handleGetFileContent({
      codebaseName: 'test-project',
      filePath: 'src/test.ts',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).toMatchObject({
      error: 'file_content_unavailable',
      filePath: 'src/test.ts',
      codebaseName: 'test-project',
    });
  });

  it('should include filePath and codebaseName on every get_file_content error response', async () => {
    const cases = [
      {
        args: { codebaseName: 'test-project' } as any,
        serviceError: null,
      },
      {
        args: { codebaseName: 'test-project', filePath: 'src/missing.ts' } as any,
        serviceError: "File not found: src/missing.ts in codebase 'test-project'",
      },
      {
        args: { codebaseName: 'ghost-project', filePath: 'src/test.ts' } as any,
        serviceError: "Codebase 'ghost-project' not found",
      },
      {
        args: { codebaseName: 'test-project', filePath: 'src/test.ts' } as any,
        serviceError:
          'File content not available in database for src/test.ts. Re-ingest the codebase with storeFullFiles enabled.',
      },
      {
        args: { codebaseName: 'test-project', filePath: 'src/test.ts' } as any,
        serviceError: 'file too large',
      },
    ];

    for (const entry of cases) {
      mockCodebaseService.getFileContent.mockReset();
      if (entry.serviceError) {
        mockCodebaseService.getFileContent.mockRejectedValue(new Error(entry.serviceError));
      }

      const response = await (server as any).handleGetFileContent(entry.args);
      const payload = JSON.parse(response.content[0].text);

      expect(payload).toHaveProperty('filePath');
      expect(payload).toHaveProperty('codebaseName');
    }
  });

  it('should return a recoverable adjacent chunk error response', async () => {
    mockCodebaseService.getAdjacentChunks.mockRejectedValue(new Error('no adjacent chunks'));

    const response = await (server as any).handleGetAdjacentChunks({
      codebaseName: 'test-project',
      filePath: 'src/test.ts',
      startLine: 11,
      endLine: 20,
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).toMatchObject({
      error: 'adjacent_chunks_failed',
      message: 'no adjacent chunks',
      filePath: 'src/test.ts',
      codebaseName: 'test-project',
      requestedRange: { startLine: 11, endLine: 20 },
    });
    expect(payload.recovery).toContain('search_codebases');
  });
});
