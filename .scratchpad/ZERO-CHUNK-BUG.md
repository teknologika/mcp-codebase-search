# Zero-Chunk Silent Failure Bug

## Issue
Files can be added to the codebase during rescan but produce 0 chunks, making them invisible to semantic search. The rescan reports success but the file is effectively missing from the index.

## Evidence
- File: `/Users/bruce/GitHub/APR-Fuel-Calculator/APR.LapTelemetry.SimhubPlugin/LapCollector.cs`
- Size: 55,597 bytes (1,343 lines)
- Language: C# (supported)
- Rescan result: `filesAdded: 1, chunksAdded: 0`
- Search result: File not found in semantic search
- File listing: File appears in list_files but has 0 chunks

## Root Cause
In `src/domains/ingestion/ingestion.service.ts` line ~820-830:

```typescript
let chunks = await this.parseFileWithAppropriateParser(file.path, file.language as any);

// If no chunks were extracted, create a file-level chunk with full content
if (chunks.length === 0 && fullFileContent) {
  // ... creates fallback chunk
}
```

The fallback only works if:
1. `storeFullFiles` config is enabled
2. File read succeeds

If either condition fails, the file is added with 0 chunks and the error is silent.

## Impact
- **Data Integrity**: Files exist on disk but are invisible to search
- **User Trust**: Users can't trust that indexed codebases are complete
- **Silent Failure**: No error or warning is logged
- **Rescan Reliability**: The rescan feature reports success but leaves gaps

## Possible Causes for LapCollector.cs
1. Tree-sitter C# parser failed silently
2. File size exceeded some internal limit
3. Parser timeout or memory issue
4. Malformed C# that parser couldn't handle
5. `storeFullFiles` is disabled and parser returned 0 chunks

## Required Fix
1. Always log when parser returns 0 chunks
2. Create file-level fallback chunk regardless of `storeFullFiles` setting
3. Add validation after rescan to detect 0-chunk files
4. Report parsing failures explicitly in rescan results
5. Add test case for large C# files

## Next Steps
1. Check config.ingestion.storeFullFiles value
2. Add debug logging to parseFileWithAppropriateParser
3. Test tree-sitter C# parser directly on LapCollector.cs
4. Implement fix with proper error handling
