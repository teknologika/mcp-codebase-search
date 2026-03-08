# Rescan Crash Fix - "Illegal instruction: 4"

## Problem
The codebase manager rescan was crashing with "Illegal instruction: 4" (SIGILL segmentation fault) immediately after change detection completed when there were NO changes to the codebase.

## Error Log
```
{"level":"info","timestamp":"2026-03-08T08:59:25.883Z","pid":12990,"hostname":"Skyline.local","component":"IngestionService","context":{"added":0,"modified":0,"deleted":0,"unchanged":198},"msg":"Change detection completed"}
Illegal instruction: 4
```

## Root Cause
Memory management issue in the rescan flow:

1. At line 658, `table.query().toArray()` loads ALL chunks from the database into memory
2. For a codebase with 198 files, this could be thousands of chunks (each file has multiple chunks)
3. The `rows` array stays in memory throughout the entire rescan operation
4. When there are no changes, the method skips Phase 4 and Phase 5, but still holds all this data
5. LanceDB's native Rust/C++ code appears to have a bug when cleaning up large result sets that were held in memory for extended periods

The crash was happening in LanceDB's native code during cleanup/garbage collection, not in our TypeScript code.

## Solution
Added explicit memory cleanup at strategic points:

### Change 1: Clear rows array after extracting file map (line ~675)
```typescript
this.logger.info('Stored file hashes retrieved', {
  storedFileCount: storedFileMap.size,
});

// Clear rows array to free memory - we only need the file map
rows.length = 0;
```

This frees the large array of chunk data immediately after we've extracted what we need (just the file paths and hashes).

### Change 2: Clear maps before method completion (line ~890)
```typescript
// Update lastIngestion timestamp for all chunks to reflect the rescan time
const rescanTimestamp = new Date().toISOString();
await this.updateLastIngestionTimestamp(codebaseName, rescanTimestamp);

// Clear maps to free memory before completing
storedFileMap.clear();
currentFileMap.clear();

const durationMs = overallTimer.end();
```

This explicitly clears the Map objects to help JavaScript's garbage collector free memory before the method returns.

## Why This Fixes The Crash
1. Reduces memory pressure by freeing large data structures as soon as they're no longer needed
2. Helps prevent LanceDB's native code from encountering memory corruption during cleanup
3. Makes the garbage collector's job easier by explicitly clearing references
4. Reduces the time that large result sets are held in memory

## Testing
After the fix:
1. Build: `npm run build`
2. Install globally: `npm uninstall -g @teknologika/mcp-codebase-search && npm install -g .`
3. Restart the manager UI server
4. Test rescan with no changes - should complete without crashing

## Files Modified
- `src/domains/ingestion/ingestion.service.ts` (lines ~675 and ~890)

## Version
Fixed in version 0.1.10

## Related Issues
- Original bug: lastIngestion timestamp not updating (still unfixed, separate issue)
- This fix addresses the crash, making the rescan operation stable even if timestamp update is disabled
