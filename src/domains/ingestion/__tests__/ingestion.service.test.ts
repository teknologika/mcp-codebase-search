import { describe, expect, it, vi } from 'vitest';
import { IngestionService } from '../ingestion.service.js';
import { DEFAULT_CONFIG } from '../../../shared/config/config.js';

describe('IngestionService storeChunks', () => {
  function createService() {
    const add = vi.fn().mockResolvedValue(undefined);
    const table = { add };
    const lanceClient = {
      getOrCreateTable: vi.fn().mockResolvedValue(table),
      createTableWithData: vi.fn(),
      tableExists: vi.fn().mockResolvedValue(true),
    };

    const service = Object.create(IngestionService.prototype) as IngestionService;
    (service as any).config = {
      ...DEFAULT_CONFIG,
      ingestion: {
        ...DEFAULT_CONFIG.ingestion,
        batchSize: 2,
      },
    };
    (service as any).logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    (service as any).lanceClient = lanceClient;

    return { service: service as any, lanceClient, add };
  }

  it('seeds an empty string when an append batch has no full file content values', async () => {
    const { service, lanceClient, add } = createService();

    await service.storeChunks(
      'demo',
      '/repo/demo',
      [
        {
          embedding: [0.1, 0.2],
          content: 'first chunk',
          startLine: 1,
          endLine: 10,
          chunkType: 'function',
          language: 'typescript',
          filePath: 'src/first.ts',
        },
        {
          embedding: [0.3, 0.4],
          content: 'second chunk',
          startLine: 11,
          endLine: 20,
          chunkType: 'function',
          language: 'typescript',
          filePath: 'src/second.ts',
        },
      ],
      '2026-04-13T00:00:00.000Z',
      new Map(),
      2
    );

    expect(lanceClient.getOrCreateTable).toHaveBeenCalledWith('demo');
    expect(add).toHaveBeenCalledTimes(1);
    const rows = add.mock.calls[0][0];
    expect(rows[0].fullFileContent).toBe('');
    expect(rows[1].fullFileContent).toBeNull();
  });

  it('preserves real full file content when the batch already contains it', async () => {
    const { service, add } = createService();

    await service.storeChunks(
      'demo',
      '/repo/demo',
      [
        {
          embedding: [0.1, 0.2],
          content: 'first chunk',
          startLine: 1,
          endLine: 10,
          chunkType: 'function',
          language: 'typescript',
          filePath: 'src/first.ts',
          fullFileContent: 'entire file body',
        },
        {
          embedding: [0.3, 0.4],
          content: 'second chunk',
          startLine: 11,
          endLine: 20,
          chunkType: 'function',
          language: 'typescript',
          filePath: 'src/first.ts',
        },
      ],
      '2026-04-13T00:00:00.000Z',
      new Map(),
      1
    );

    const rows = add.mock.calls[0][0];
    expect(rows[0].fullFileContent).toBe('entire file body');
    expect(rows[1].fullFileContent).toBeNull();
  });

  it('falls back to a full ingest when no chunk table exists', async () => {
    const { service, lanceClient } = createService();
    vi.mocked(lanceClient.getOrCreateTable).mockResolvedValue(null);
    vi.mocked(lanceClient.tableExists).mockResolvedValue(false);

    const ingestSpy = vi
      .spyOn(service, 'ingestCodebase')
      .mockResolvedValue({
        totalFiles: 0,
        supportedFiles: 0,
        unsupportedFiles: new Map(),
        chunksCreated: 0,
        languages: new Map(),
        durationMs: 42,
        filesSuccessfullyParsed: 0,
        filesFailedToParse: 0,
      } as any);

    const result = await service.rescanCodebase('demo', '/repo/demo');

    expect(ingestSpy).toHaveBeenCalledWith(
      { name: 'demo', path: '/repo/demo' },
      undefined
    );
    expect(result).toMatchObject({
      codebaseName: 'demo',
      filesScanned: 0,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesUnchanged: 0,
      filesIndexed: 0,
      filesDropped: 0,
      chunksAdded: 0,
      chunksDeleted: 0,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
