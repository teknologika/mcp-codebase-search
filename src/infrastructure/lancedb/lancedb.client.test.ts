import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanceDBClientWrapper } from './lancedb.client.js';

const hoisted = vi.hoisted(() => {
  const add = vi.fn();
  const deleteFn = vi.fn();
  const queryToArray = vi.fn();
  const query = vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(() => ({
        toArray: queryToArray,
      })),
    })),
  }));
  const metadataTable = {
    add,
    delete: deleteFn,
    query,
  };

  const connection = {
    tableNames: vi.fn(),
    createTable: vi.fn(),
    openTable: vi.fn(),
  };

  return {
    add,
    deleteFn,
    queryToArray,
    metadataTable,
    connection,
    connectMock: vi.fn(),
  };
});

vi.mock('@lancedb/lancedb', () => ({
  connect: hoisted.connectMock,
}));

describe('LanceDBClientWrapper metadata persistence', () => {
  const config = {
    lancedb: { persistPath: '/tmp/lancedb-test' },
    embedding: { modelName: 'test', cachePath: '/tmp/cache' },
    server: { port: 3000, host: '127.0.0.1' },
    mcp: { transport: 'stdio' as const },
    ingestion: {
      batchSize: 1,
      maxFileSize: 1024,
      maxChunkTokens: 1,
      chunkOverlapTokens: 0,
      storeFullFiles: false,
    },
    search: { defaultMaxResults: 10, cacheTimeoutSeconds: 60 },
    logging: { level: 'info' as const },
    schemaVersion: '1.0.0',
  };

  beforeEach(() => {
    hoisted.add.mockReset();
    hoisted.deleteFn.mockReset();
    hoisted.queryToArray.mockReset();
    hoisted.connectMock.mockReset();
    hoisted.connection.tableNames = vi.fn();
    hoisted.connection.createTable = vi.fn();
    hoisted.connection.openTable = vi.fn();
  });

  it('should include last rescan snapshot fields when creating the metadata table', async () => {
    hoisted.connection.tableNames.mockResolvedValue([]);
    hoisted.connection.createTable.mockResolvedValue(hoisted.metadataTable);
    hoisted.connectMock.mockResolvedValue(hoisted.connection);
    hoisted.queryToArray.mockResolvedValue([]);

    const client = new LanceDBClientWrapper(config as any);
    await client.initialize();

    await client.setMetadata({
      name: 'demo',
      path: '/repo/demo',
      createdAt: '2026-04-10T00:00:00.000Z',
      lastIngested: '2026-04-10T00:00:00.000Z',
      lastModified: '2026-04-10T00:00:00.000Z',
      chunkCount: 1,
      fileCount: 1,
      sizeBytes: 10,
      languages: [],
      chunkTypes: [],
      schemaVersion: '1.0.0',
      tableName: 'codebase_demo_1_0_0',
      status: 'active',
      lastRescanChangedAt: '2026-04-10T00:00:00.000Z',
      lastRescanFilesChanged: 2,
      lastRescanFilesAdded: 1,
      lastRescanFilesModified: 1,
      lastRescanFilesDeleted: 0,
      lastRescanChangedFilePaths: ['src/a.ts', 'src/b.ts'],
    });

    expect(hoisted.connection.createTable).toHaveBeenCalledTimes(1);
    const createTableArgs = hoisted.connection.createTable.mock.calls[0];
    const initialRow = createTableArgs[1][0];
    expect(initialRow.lastRescanChangedAt).toBe('');
    expect(initialRow.lastRescanFilesChanged).toBe(0);
    expect(initialRow.lastRescanChangedFilePaths).toBe('[]');
    expect(hoisted.add).toHaveBeenCalledTimes(1);
    expect(hoisted.add.mock.calls[0][0][0].lastRescanChangedFilePaths).toBe('["src/a.ts","src/b.ts"]');
    expect(hoisted.add.mock.calls[0][0][0].lastRescanChangedAt).toBe('2026-04-10T00:00:00.000Z');
  });

  it('should preserve last rescan snapshot fields when updating metadata', async () => {
    hoisted.connection.tableNames.mockResolvedValue(['_codebase_metadata']);
    hoisted.connection.openTable.mockResolvedValue(hoisted.metadataTable);
    hoisted.connection.createTable.mockResolvedValue(hoisted.metadataTable);
    hoisted.connectMock.mockResolvedValue(hoisted.connection);
    hoisted.queryToArray.mockResolvedValue([
      {
        name: 'demo',
        path: '/repo/demo',
        createdAt: '2026-04-09T00:00:00.000Z',
        lastIngested: '2026-04-09T00:00:00.000Z',
        lastModified: '2026-04-09T00:00:00.000Z',
        chunkCount: 1,
        fileCount: 1,
        sizeBytes: 10,
        languages: '[]',
        chunkTypes: '[]',
        schemaVersion: '1.0.0',
        tableName: 'codebase_demo_1_0_0',
        status: 'active',
        lastRescanChangedAt: '2026-04-09T00:00:00.000Z',
        lastRescanFilesChanged: 1,
        lastRescanFilesAdded: 1,
        lastRescanFilesModified: 0,
        lastRescanFilesDeleted: 0,
        lastRescanChangedFilePaths: ['src/old.ts'],
      },
    ]);

    const client = new LanceDBClientWrapper(config as any);
    await client.initialize();

    await client.setMetadata({
      name: 'demo',
      path: '/repo/demo',
      createdAt: '2026-04-10T00:00:00.000Z',
      lastIngested: '2026-04-10T00:00:00.000Z',
      lastModified: '2026-04-10T00:00:00.000Z',
      chunkCount: 1,
      fileCount: 1,
      sizeBytes: 10,
      languages: [],
      chunkTypes: [],
      schemaVersion: '1.0.0',
      tableName: 'codebase_demo_1_0_0',
      status: 'active',
      lastRescanChangedAt: '2026-04-10T00:00:00.000Z',
      lastRescanFilesChanged: 2,
      lastRescanFilesAdded: 1,
      lastRescanFilesModified: 1,
      lastRescanFilesDeleted: 0,
      lastRescanChangedFilePaths: ['src/a.ts', 'src/b.ts'],
    });

    expect(hoisted.add).toHaveBeenCalledTimes(1);
    expect(hoisted.add.mock.calls[0][0][0].lastRescanChangedFilePaths).toBe('["src/a.ts","src/b.ts"]');
    expect(hoisted.add.mock.calls[0][0][0].lastRescanFilesChanged).toBe(2);
    expect(hoisted.deleteFn).toHaveBeenCalledTimes(1);
  });
});
