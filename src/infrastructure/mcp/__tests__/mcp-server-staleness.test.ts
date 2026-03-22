/**
 * Unit tests for MCP server staleness warnings
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPServer } from '../mcp-server.js';
import { DEFAULT_CONFIG } from '../../../shared/config/config.js';

describe('MCPServer stale warning behavior', () => {
  let server: MCPServer;
  let mockCodebaseService: {
    listCodebases: ReturnType<typeof vi.fn>;
    getAdjacentChunks: ReturnType<typeof vi.fn>;
  };
  let mockSearchService: { search: ReturnType<typeof vi.fn> };
  let mockIngestionService: Record<string, unknown>;

  beforeEach(() => {
    mockCodebaseService = {
      listCodebases: vi.fn(),
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
  });

  it('should not include a warning for a fresh index', async () => {
    mockCodebaseService.listCodebases.mockResolvedValue([
      {
        name: 'test-project',
        lastIngestion: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
    ]);

    const response = await (server as any).handleSearchCodebases({
      query: 'test query',
      codebaseName: 'test-project',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).not.toHaveProperty('staleWarning');
  });

  it('should include a stale warning for an old index', async () => {
    mockCodebaseService.listCodebases.mockResolvedValue([
      {
        name: 'test-project',
        lastIngestion: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
    ]);

    const response = await (server as any).handleSearchCodebases({
      query: 'test query',
      codebaseName: 'test-project',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).toHaveProperty('staleWarning');
    expect(payload.staleWarning).toContain('update_codebase_scan');
  });

  it('should ignore missing lastIngestion values', async () => {
    mockCodebaseService.listCodebases.mockResolvedValue([
      {
        name: 'test-project',
      },
    ]);

    const response = await (server as any).handleSearchCodebases({
      query: 'test query',
      codebaseName: 'test-project',
    });

    const payload = JSON.parse(response.content[0].text);
    expect(payload).not.toHaveProperty('staleWarning');
  });

  it('should include only the top N content results when requested', async () => {
    mockCodebaseService.listCodebases.mockResolvedValue([
      {
        name: 'test-project',
        lastIngestion: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
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
});
