# Bug Analysis: get_file_content File Not Found

## Problem
`get_file_content` fails with "File not found" error even when the file exists in the codebase.

## Root Cause
**Path mismatch between ingestion and retrieval:**

### During Ingestion (ingestion.service.ts line ~160):
```typescript
let chunks = await this.parser.parseFile(file.path, file.language as any);
```
- `file.path` is the **absolute path** (e.g., `/Users/bruce/GitHub/chisel/src/tools/builtinExecutor.ts`)
- This absolute path is stored in the chunk's `filePath` field

### During Retrieval (codebase.service.ts line ~622):
```typescript
// Normalize the file path - handle both relative and absolute paths
let normalizedFilePath = filePath;
if (path.isAbsolute(filePath)) {
  // Convert absolute path to relative path from codebase root
  normalizedFilePath = path.relative(codebasePath, filePath);
}

// Query for all chunks of this file
const rows = await table
  .query()
  .where(`\`filePath\` = '${escapedFilePath}'`)
  .toArray();
```
- The query tries to match against `normalizedFilePath` (relative path)
- But chunks are stored with **absolute paths**
- Result: No match found → "File not found" error

## Evidence
From the codebase search results:
1. `file-scanner.service.ts` creates `ScannedFile` with both `path` (absolute) and `relativePath`
2. `ingestion.service.ts` passes `file.path` (absolute) to parser
3. `tree-sitter-parsing.service.ts` stores this absolute path in chunks
4. `codebase.service.ts` queries using relative path

## Solution
**Option 1: Store relative paths during ingestion** (RECOMMENDED)
- Change ingestion to use `file.relativePath` instead of `file.path` when creating chunks
- This makes the database consistent and queries simpler

**Option 2: Query with absolute paths**
- Change `getFileContent` to query using absolute paths
- Less clean, requires path reconstruction

**Option 3: Store both paths**
- Add a `relativeFilePath` field to chunks
- Query using the relative path field
- More storage overhead

## Recommended Fix
Use Option 1: Update ingestion to store relative paths in chunks.

## Fix Applied
Modified `src/domains/ingestion/ingestion.service.ts` line ~178 to convert absolute paths to relative paths:

```typescript
// Convert absolute paths to relative paths in all chunks
chunks = chunks.map(chunk => ({
  ...chunk,
  filePath: file.relativePath,
}));
```

This ensures that:
1. All chunks are stored with relative paths (e.g., `src/tools/builtinExecutor.ts`)
2. The `getFileContent` query can match chunks using relative paths
3. Both relative and absolute path inputs to `getFileContent` work correctly

## Testing
The fix requires re-ingesting existing codebases to update the stored paths. After re-ingestion:
- `get_file_content` with relative paths will work
- `get_file_content` with absolute paths will be converted to relative and work
- No more "File not found" errors for files that exist in the codebase


## Additional Issue Found: Rescan Path Mismatch

The rescan has a secondary bug:
1. Old database has absolute paths stored (e.g., `/Users/bruce/GitHub/mcp-codebase-search/src/file.ts`)
2. Rescan builds a map using `file.relativePath` as the key (e.g., `src/file.ts`)
3. When comparing: `storedFileMap.get(file.relativePath)` returns undefined
4. Result: All files appear as "new" + "deleted" instead of "unchanged"
5. This causes unnecessary re-processing but DOES apply the fix

## Solution
The fix is working! The rescan is re-processing all files with the new relative path logic. The database now has a mix of old absolute paths (being deleted) and new relative paths (being added). We need to wait for the deletion to complete or manually delete the old table.

## Verification Needed
Check if newer chunks in the database have relative paths.
