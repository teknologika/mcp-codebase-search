import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import type { ChildProcess, ExecFileException, ExecFileOptions } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { CodebaseService } from '../domains/codebase/codebase.service.js';
import type { LanceDBClientWrapper } from '../infrastructure/lancedb/lancedb.client.js';
import { DEFAULT_CONFIG } from '../shared/config/config.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}));

interface ChunkRow {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
}

type ExecFileCallback = (
  error: ExecFileException | null,
  stdout: string,
  stderr: string
) => void;

type ExecFileMock = (
  file: string,
  args: readonly string[] | null | undefined,
  options: ExecFileOptions | null | undefined,
  callback: ExecFileCallback | null | undefined
) => ChildProcess;

function createService(rows: ChunkRow[]): CodebaseService {
  const table = {
    query: vi.fn(() => ({
      where: vi.fn((filter: string) => ({
        toArray: vi.fn(async () => {
          const match = filter.match(/`filePath` = '([^']+)'/);
          const filePath = match?.[1] ?? '';
          return rows.filter((row) => row.filePath === filePath);
        }),
      })),
    })),
  };

  const lanceClient = {
    listAllMetadata: vi.fn(async () => [
      {
        name: 'demo',
        path: '/repo/demo',
        chunkCount: rows.length,
        fileCount: new Set(rows.map((row) => row.filePath)).size,
        languages: ['typescript'],
        createdAt: '2024-01-01T00:00:00Z',
        lastModified: '2024-01-01T00:00:00Z',
        tableName: 'codebase_demo_1_0_0',
        status: 'active',
      },
    ]),
    listTables: vi.fn(async () => []),
    getOrCreateTable: vi.fn(async () => table),
  } as unknown as LanceDBClientWrapper;

  return new CodebaseService(lanceClient, DEFAULT_CONFIG);
}

function mockExecFileSuccess(stdout: string): void {
  vi.mocked(execFile).mockImplementation(((_file, _args, _options, callback) => {
    callback?.(null, stdout, '');
    return undefined as unknown as ChildProcess;
  }) as ExecFileMock);
}

describe('detectChanges', () => {
  beforeEach(() => {
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(execFile).mockReset();
  });

  it('maps changed ranges to overlapping indexed chunks and marks index files high risk', async () => {
    const diff = [
      'diff --git a/src/index.ts b/src/index.ts',
      '--- a/src/index.ts',
      '+++ b/src/index.ts',
      '@@ -14,0 +15,3 @@',
      'diff --git a/src/new-file.ts b/src/new-file.ts',
      '--- /dev/null',
      '+++ b/src/new-file.ts',
      '@@ -0,0 +1,2 @@',
      '',
    ].join('\n');
    mockExecFileSuccess(diff);

    const service = createService([
      {
        id: 'chunk-1',
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 20,
        content: '\nexport function boot() {\n  return true;\n}',
      },
      {
        id: 'chunk-2',
        filePath: 'src/index.ts',
        startLine: 30,
        endLine: 40,
        content: 'export const untouched = true;',
      },
    ]);

    const result = await service.detectChanges({ codebaseName: 'demo' });

    expect(result.totalFilesChanged).toBe(2);
    expect(result.totalChunksAffected).toBe(1);
    expect(result.files[0]).toMatchObject({
      filePath: 'src/index.ts',
      changeType: 'modified',
      indexed: true,
      risk: 'high',
      changedLineRanges: [{ start: 15, end: 17 }],
      affectedChunks: [
        {
          chunkId: 'chunk-1',
          startLine: 10,
          endLine: 20,
          preview: 'export function boot() {',
        },
      ],
    });
    expect(result.files[1]).toMatchObject({
      filePath: 'src/new-file.ts',
      changeType: 'added',
      indexed: false,
      risk: 'low',
      affectedChunks: [],
    });
  });

  it('returns a structured error when git diff fails', async () => {
    vi.mocked(execFile).mockImplementation(((_file, _args, _options, callback) => {
      callback?.(new Error('git not found') as ExecFileException, '', '');
      return undefined as unknown as ChildProcess;
    }) as ExecFileMock);

    const service = createService([]);
    const result = await service.detectChanges({ codebaseName: 'demo', baseRef: 'main' });

    expect(result).toMatchObject({
      codebaseName: 'demo',
      baseRef: 'main',
      totalFilesChanged: 0,
      totalChunksAffected: 0,
      files: [],
      error: 'git not found',
    });
  });
});
