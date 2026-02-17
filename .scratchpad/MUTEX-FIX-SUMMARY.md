# Mutex Error Fix - Summary

## Problem
CLI ingestion was crashing with a mutex error during cleanup:
```
libc++abi: terminating due to uncaught exception of type std::__1::system_error: mutex lock failed: Invalid argument
Abort trap: 6
```

This prevented LanceDB tables from being properly persisted to disk, causing:
- Tables to exist in memory but not on disk
- MCP server unable to access ingested data
- `get_file_content` and `list_files` failing with "Codebase not found"

## Root Cause
The CLI was using `process.exit(0)` which forces immediate termination of the Node.js process. This didn't give LanceDB's native C++ code time to properly cleanup and flush data to disk, resulting in a mutex lock error during forced cleanup.

## Solution
Changed the CLI to use graceful shutdown:

1. **Added `close()` method to LanceDBClientWrapper** (`src/infrastructure/lancedb/lancedb.client.ts`)
   - Properly nulls the connection
   - Marks client as uninitialized
   - Allows native code to cleanup gracefully

2. **Updated CLI to use graceful exit** (`src/bin/ingest.ts`)
   - Call `await lanceClient.close()` before exit
   - Use `process.exitCode = 0` instead of `process.exit(0)`
   - Let Node.js event loop drain naturally

## Changes Made

### src/infrastructure/lancedb/lancedb.client.ts
```typescript
/**
 * Close the LanceDB connection and cleanup resources
 */
async close(): Promise<void> {
  if (this.connection) {
    try {
      this.logger.debug('Closing LanceDB connection');
      this.connection = null;
      this.initialized = false;
      this.logger.debug('LanceDB connection closed successfully');
    } catch (error) {
      // error handling
    }
  }
}
```

### src/bin/ingest.ts
```typescript
// Before (forced exit):
await new Promise(resolve => setTimeout(resolve, 100));
process.exit(0);

// After (graceful shutdown):
await lanceClient.close();
process.exitCode = 0;
```

## Testing Results

### Before Fix
```bash
$ mcp-codebase-ingest --name chisel --path /Users/bruce/GitHub/chisel
✓ Ingestion completed successfully!
libc++abi: terminating due to uncaught exception of type std::__1::system_error: mutex lock failed: Invalid argument
Abort trap: 6

$ ls ~/.codebase-memory/lancedb/
# No chisel table exists
```

### After Fix
```bash
$ mcp-codebase-ingest --name chisel --path /Users/bruce/GitHub/chisel
✓ Ingestion completed successfully!
# Clean exit, no error

$ ls ~/.codebase-memory/lancedb/
codebase_chisel_1_0_0.lance  # Table persisted to disk!
```

### MCP Tools Now Work
```javascript
// list_codebases - shows chisel
{ codebases: [{ name: "chisel", chunkCount: 565, ... }] }

// list_files - returns 120 files
{ files: [...], totalFiles: 120 }

// get_file_content - retrieves file content
{ content: "import type { ToolCatalogEntry } ...", ... }
```

## Impact
- ✅ No more mutex errors during CLI ingestion
- ✅ LanceDB tables properly persisted to disk
- ✅ MCP server can access ingested data
- ✅ All MCP tools work correctly
- ✅ Data survives process restart

## Version
Fixed in version 0.1.7

## Related Issues
- Rescan bug (fixed separately - using `rescanCodebase` instead of `ingestCodebase`)
- File-level chunk fallback (implemented for files with no AST chunks)
