# Rescan Bug Analysis

## Problem
`update_codebase_scan` MCP tool causes codebase to disappear after execution.

## Root Cause
The `handleUpdateCodebaseScan` method in `mcp-server.ts` calls `ingestCodebase` instead of `rescanCodebase`.

`ingestCodebase` has a destructive flow:
1. Phase 1-2: Scan and parse files
2. **Phase 3: Delete entire table** (via `handleReingestion`)
3. Phase 4-5: Generate embeddings and store

If anything fails after Phase 3, the table is deleted but never recreated.

## Evidence
```typescript
// mcp-server.ts line 382
private async handleUpdateCodebaseScan(args: unknown) {
  // ...
  // Re-ingest the codebase
  const stats = await this.ingestionService.ingestCodebase({  // ❌ Wrong method
    name,
    path: codebase.path,
    respectGitignore: true,
    config: this.config,
  });
  // ...
}
```

```typescript
// ingestion.service.ts line 340
private async handleReingestion(codebaseName: string): Promise<number> {
  // ...
  // Delete the table  ❌ Happens early, before new data is ready
  await this.lanceClient.deleteTable(codebaseName);
  // ...
}
```

## Solution
Change `handleUpdateCodebaseScan` to call `rescanCodebase` instead of `ingestCodebase`.

`rescanCodebase` is safer because it:
1. Scans filesystem
2. Compares with existing data
3. **Only deletes specific chunks** for changed/deleted files
4. Adds new chunks
5. Never drops the entire table

## Fix
```typescript
// mcp-server.ts
private async handleUpdateCodebaseScan(args: unknown) {
  // ...
  
  // Use rescanCodebase instead of ingestCodebase
  const result = await this.ingestionService.rescanCodebase(
    name,
    codebase.path,
    (message, current, total) => {
      // Optional: progress callback
    }
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
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
            message: `Successfully refreshed codebase '${name}': ${result.filesAdded} added, ${result.filesModified} modified, ${result.filesDeleted} deleted`,
          },
          null,
          2
        ),
      },
    ],
  };
}
```

## Testing Plan
1. Build and deploy: `npm run build && npm install -g .`
2. Restart MCP server in Claude Desktop
3. Test sequence:
   - `list_codebases` - verify chisel exists
   - `update_codebase_scan("chisel")` - should succeed
   - `list_codebases` - verify chisel still exists
   - `search_codebases` - verify search still works
   - `get_file_content` - verify file retrieval works
