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
  let mockSearchService: { search: ReturnType<typeof vi.fn> };
  let mockIngestionService: Record<string, unknown>;

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
        results: [],
        totalResults: 0,
        queryTime: 1,
      }),
    };

    mockIngestionService = {};
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
