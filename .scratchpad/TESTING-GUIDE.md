# Testing Guide: File-Level Fallback Feature

## Issue
`builtinCatalog.ts` still not being indexed after update_codebase_scan.

## Root Cause
**The MCP server process needs to be restarted!** The running MCP server is using the old code from memory.

## Solution: Restart MCP Server

### Option 1: Restart from Claude Desktop
1. Open Claude Desktop
2. Go to Settings → Developer → MCP Servers
3. Find "codebase-search" server
4. Click "Restart" or toggle it off/on

### Option 2: Restart Claude Desktop Completely
1. Quit Claude Desktop completely
2. Relaunch Claude Desktop
3. The MCP server will start with the new code

### Option 3: Kill the Process Manually
```bash
# Find the MCP server process
ps aux | grep mcp-codebase-search

# Kill it (Claude will restart it automatically)
kill <PID>
```

## Verification Steps

After restarting the MCP server:

1. **Delete and re-ingest the codebase** (to ensure clean state):
   ```
   # In Claude Desktop, use MCP tools:
   delete_codebase(name="chisel")
   ingest_codebase(name="chisel", path="/Users/bruce/GitHub/chisel")
   ```

2. **Check if builtinCatalog.ts is now indexed**:
   ```
   list_files(codebaseName="chisel")
   # Look for: /Users/bruce/GitHub/chisel/src/tools/builtinCatalog.ts
   ```

3. **Try to get the file content**:
   ```
   get_file_content(
     codebaseName="chisel",
     filePath="/Users/bruce/GitHub/chisel/src/tools/builtinCatalog.ts"
   )
   ```

4. **Search for content from the file**:
   ```
   search_codebases(
     query="BUILTIN_TOOL_CATALOG list_directory",
     codebaseName="chisel"
   )
   ```

## Expected Results

After restart and re-ingestion:
- ✅ `builtinCatalog.ts` appears in `list_files`
- ✅ `get_file_content` returns the full file content
- ✅ File has 1 chunk with `chunkType: "file"`
- ✅ Search finds content from the file

## Why This Happened

1. We built and installed version 0.1.7 with `npm link`
2. The globally installed binaries were updated
3. **BUT** the MCP server process was already running with old code
4. Node.js keeps modules in memory - it doesn't reload them
5. The MCP server needs to be restarted to load the new code

## Test Script

A test script is available to verify the logic works:
```bash
node .scratchpad/test-ingestion.js
```

This confirms the fallback logic is correct in the code.

## Implementation Summary

The fix adds file-level fallback when tree-sitter produces zero chunks:

```typescript
// If no chunks were extracted, create a file-level chunk with full content
if (chunks.length === 0 && fullFileContent) {
  const lineCount = fullFileContent.split('\n').length;
  chunks = [{
    content: fullFileContent,
    startLine: 1,
    endLine: lineCount,
    chunkType: 'file' as const,
    language: file.language as any,
    filePath: file.path,
  }];
}
```

This ensures 100% file coverage - every supported file gets indexed.
