# Complete Zero-Chunk Bug Analysis

## Summary
LapCollector.cs (55KB, 1343 lines) was added during rescan but produced 0 chunks, making it invisible to semantic search. This is a critical data integrity bug.

## Root Cause Chain

### 1. Tree-sitter C# Parser Failure
The tree-sitter-c-sharp parser throws "Invalid argument" error when parsing LapCollector.cs:
```
Error: Invalid argument
    at Parser.parse (tree-sitter/index.js:361:13)
```

This could be due to:
- Specific C# syntax that the parser doesn't handle
- File encoding issues
- Parser bug with certain code patterns
- Memory/buffer size issues

### 2. Error Caught in Rescan Loop
In `ingestion.service.ts` line ~850:
```typescript
} catch (error) {
  this.logger.error(
    'Failed to parse file, skipping',
    error instanceof Error ? error : new Error(String(error)),
    { filePath: file.relativePath }
  );
}
```

The error is logged but the file is silently skipped. The loop continues without adding the file to `allChunks`.

### 3. Silent Failure in Results
The rescan reports:
- `filesAdded: 1` ✓ (file was detected as new)
- `chunksAdded: 0` ✗ (no chunks were created)

No indication that the file failed to parse or was skipped.

## Impact

### Data Integrity
- Files can exist on disk but be invisible to search
- Users can't trust that indexed codebases are complete
- No way to detect missing files without manual verification

### User Experience
- Silent failures erode trust
- Debugging requires checking logs
- Rescan appears successful but data is incomplete

### Product Claims
Violates the "Production Ready" status claim. The core promise of reliable semantic search is broken.

## The Fix

### Phase 1: Immediate Fix (Error Handling)
1. Track parsing failures explicitly in RescanResult
2. Log ERROR (not just debug) for each failed file
3. Return list of failed files with error messages
4. Update MCP tool response to include failures

```typescript
interface RescanResult {
  // ... existing fields
  filesFailed: number;
  failedFiles: Array<{
    filePath: string;
    error: string;
  }>;
}
```

### Phase 2: Parser Robustness
1. Add timeout to tree-sitter parsing (prevent hangs)
2. Catch parser errors and create file-level fallback chunks
3. Add parser error recovery for common issues
4. Test with known problematic files

### Phase 3: Validation
1. Add post-rescan validation check
2. Warn if any files have 0 chunks
3. Provide tool to list files with 0 chunks
4. Add health check endpoint

## Recommended Implementation Order

1. **Immediate** (today): Add explicit failure tracking to rescan
2. **Short-term** (this week): Implement fallback chunking for parser failures
3. **Medium-term** (next sprint): Add validation and health checks
4. **Long-term**: Investigate tree-sitter-c-sharp parser issue

## Test Cases Needed

1. File that causes parser to throw error
2. File that causes parser to hang
3. File with encoding issues
4. Very large file (>1MB)
5. File with unusual C# syntax
6. Malformed C# file

## Questions to Answer

1. Why does tree-sitter-c-sharp fail on LapCollector.cs specifically?
2. Are there other files in the codebase with 0 chunks?
3. Should we always create fallback chunks for parser failures?
4. What's the right balance between strict validation and permissive ingestion?

## Next Steps

1. Check if other files in apr-fuel-calculator have 0 chunks
2. Try to isolate the specific C# syntax causing the parser error
3. Implement Phase 1 fix (failure tracking)
4. Create test case with LapCollector.cs
5. Consider filing bug report with tree-sitter-c-sharp project
