# Rescan File-Level Chunk Fix

## Problem
`rescanCodebase` was not applying the file-level fallback logic that `ingestCodebase` uses. When files containing only imports/exports (like `builtinCatalog.ts`) were rescanned, they produced zero chunks and were effectively deleted from the index.

## Root Cause
The `rescanCodebase` method (lines 601-883) was missing the file-level fallback logic that exists in `ingestCodebase` (lines 140-200).

## Solution
Extended `rescanCodebase` to use the same file-level fallback pattern as `ingestCodebase`:

### Changes Made (lines 764-810)
1. Read full file content if `storeFullFiles` is enabled
2. If parsing produces zero chunks AND full content is available, create a file-level chunk
3. Store full file content on the first chunk to avoid duplication

### Code Pattern (Identical in Both Methods)
```typescript
// Read full file content if storeFullFiles is enabled
let fullFileContent: string | undefined;
if (this.config.ingestion.storeFullFiles) {
  try {
    fullFileContent = await readFile(file.path, 'utf-8');
  } catch (error) {
    this.logger.warn('Failed to read full file content, continuing without it', {
      filePath: file.relativePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

let chunks = await this.parser.parseFile(file.path, file.language as any);

// If no chunks were extracted, create a file-level chunk with full content
if (chunks.length === 0 && fullFileContent) {
  this.logger.info('No chunks extracted, creating file-level chunk', {
    filePath: file.relativePath,
    language: file.language,
  });
  
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

const classification = classifyFile(file.relativePath);
const chunksWithMetadata = chunks.map((chunk, index) => ({
  ...chunk,
  isTestFile: classification.isTest,
  isLibraryFile: classification.isLibrary,
  fileHash,
  // Store full file content only on the first chunk to avoid duplication
  fullFileContent: index === 0 ? fullFileContent : undefined,
}));
```

## Dedupe Verification

### Existing Implementations
- `ingestCodebase` (lines 140-200): ✅ Original implementation
- `rescanCodebase` (lines 764-810): ✅ Extended with same pattern

### No Duplication
- Only 2 occurrences of the log message "No chunks extracted, creating file-level chunk"
- Both are in `ingestion.service.ts` in the expected methods
- No other rescan implementations exist
- ChunkType enum already includes 'file' type (line 13 in types/index.ts)

### Dependencies
- `readFile` from 'fs/promises': ✅ Already imported (line 25)
- `classifyFile`: ✅ Already imported (line 24)
- `calculateFileHash`: ✅ Already imported (line 25)

## Test Results

### Before Fix (Old MCP Server)
- Initial ingestion: 565 chunks (including builtinCatalog.ts)
- After rescan: 551 chunks (14 file-level chunks lost)
- `get_file_content("builtinCatalog.ts")`: ❌ File not found

### After Fix (New Code)
- Rescan will preserve file-level chunks
- Files with only imports/exports remain accessible
- Metadata (path, chunkCount) preserved

## Files Modified
- `src/domains/ingestion/ingestion.service.ts` (lines 764-810)

## Version
Fixed in version 0.1.7

## Deployment Status
✅ Built and installed globally with `npm install -g .`
✅ CLI ingestion tested successfully (574 chunks created)
✅ File-level chunks working (builtinCatalog.ts accessible with chunkType: "file")
✅ Codebase metadata preserved (path, chunkCount correct)

## Next Steps for Full Testing
User needs to restart MCP server in Claude Desktop to test the rescan functionality with the new code.

## Test Results with New Code

### CLI Ingestion (Fresh Install)
- ✅ 574 chunks created from 120 files
- ✅ 15 file-level chunks created (including builtinCatalog.ts)
- ✅ `get_file_content("builtinCatalog.ts")` works
- ✅ Path metadata preserved: "/Users/bruce/GitHub/chisel"

### Pending: Rescan Test with Updated MCP Server
Once MCP server is restarted in Claude Desktop:
1. Run `update_codebase_scan("chisel")`
2. Verify response format shows rescan stats (filesAdded, filesModified, etc.)
3. Test `get_file_content("builtinCatalog.ts")` still works after rescan
4. Verify codebase metadata remains intact (path, chunkCount)
