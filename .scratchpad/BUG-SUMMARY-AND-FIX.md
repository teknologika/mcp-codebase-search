# Zero-Chunk Bug: Summary and Fix

## Bug Report

**Severity**: Critical  
**Component**: Ingestion Service (rescan functionality)  
**Impact**: Data integrity - files can be silently excluded from search index

### Reproduction
1. File exists on disk: `LapCollector.cs` (55KB, 1343 lines, valid C#)
2. Run `update_codebase_scan` on apr-fuel-calculator
3. Result: `filesAdded: 1, chunksAdded: 0`
4. File appears in `list_files` but cannot be found via `search_codebases`
5. Attempting `get_file_content` fails with "File not found"

### Root Cause
Tree-sitter C# parser throws "Invalid argument" error for this specific file. The error is caught in the rescan loop (ingestion.service.ts:~850) and logged, but the file is silently skipped. No indication in the rescan results that parsing failed.

## Proposed Fix

### Option A: Explicit Failure Tracking (RECOMMENDED)
Track and report parsing failures explicitly.

**Changes to `src/shared/types/index.ts`:**
```typescript
export interface RescanResult {
  codebaseName: string;
  filesScanned: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesUnchanged: number;
  filesFailed: number;  // NEW
  chunksAdded: number;
  chunksDeleted: number;
  durationMs: number;
  failedFiles?: Array<{  // NEW
    filePath: string;
    error: string;
  }>;
}
```

**Changes to `src/domains/ingestion/ingestion.service.ts` (rescanCodebase method):**

1. Add tracking array at start of Phase 5:
```typescript
const filesToProcess = [...addedFiles, ...modifiedFiles];
const failedFiles: Array<{ filePath: string; error: string }> = [];
let chunksAdded = 0;
```

2. Update error handler (~line 850):
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  this.logger.error(
    'Failed to parse file during rescan',
    error instanceof Error ? error : new Error(errorMessage),
    { filePath: file.relativePath, language: file.language }
  );
  
  // Track the failure
  failedFiles.push({
    filePath: file.relativePath,
    error: errorMessage,
  });
}
```

3. Update result object:
```typescript
const result: RescanResult = {
  codebaseName,
  filesScanned: supportedFiles.length,
  filesAdded: addedFiles.length,
  filesModified: modifiedFiles.length,
  filesDeleted: deletedFiles.length,
  filesUnchanged: unchangedFiles.length,
  filesFailed: failedFiles.length,  // NEW
  chunksAdded,
  chunksDeleted,
  durationMs,
  failedFiles: failedFiles.length > 0 ? failedFiles : undefined,  // NEW
};
```

4. Update final log message:
```typescript
this.logger.info('Rescan completed', {
  codebaseName,
  filesScanned: result.filesScanned,
  filesAdded: result.filesAdded,
  filesModified: result.filesModified,
  filesDeleted: result.filesDeleted,
  filesUnchanged: result.filesUnchanged,
  filesFailed: result.filesFailed,  // NEW
  chunksAdded: result.chunksAdded,
  chunksDeleted: result.chunksDeleted,
  durationMs: result.durationMs,
});

// NEW: Warn if files failed
if (failedFiles.length > 0) {
  this.logger.warn('Some files failed to parse during rescan', {
    codebaseName,
    failedCount: failedFiles.length,
    failedFiles: failedFiles.map(f => f.filePath),
  });
}
```

**Changes to MCP tool response:**
Update the success message in `src/infrastructure/mcp/mcp-server.ts` to include failure info:
```typescript
let message = `Successfully refreshed codebase '${name}': ${result.filesAdded} added, ${result.filesModified} modified, ${result.filesDeleted} deleted, ${result.filesUnchanged} unchanged`;

if (result.filesFailed > 0) {
  message += `, ${result.filesFailed} failed to parse`;
}
```

### Option B: Fallback Chunking (ADDITIONAL)
When parser fails, always create a file-level chunk as fallback.

**Changes to rescan error handler:**
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  this.logger.warn(
    'Parser failed, creating file-level fallback chunk',
    { filePath: file.relativePath, language: file.language, error: errorMessage }
  );
  
  // Create fallback chunk with full file content
  try {
    const fallbackContent = await readFile(file.path, 'utf-8');
    const lineCount = fallbackContent.split('\n').length;
    
    const fallbackChunk: Chunk = {
      content: fallbackContent,
      startLine: 1,
      endLine: lineCount,
      chunkType: 'file',
      language: file.language as any,
      filePath: file.relativePath,
    };
    
    const classification = classifyFile(file.relativePath);
    const chunkWithMetadata = {
      ...fallbackChunk,
      isTestFile: classification.isTest,
      isLibraryFile: classification.isLibrary,
      fileHash,
      fullFileContent: fallbackContent,
    };
    
    allChunks.push(chunkWithMetadata);
    
    this.logger.info('Created fallback chunk for failed parse', {
      filePath: file.relativePath,
    });
  } catch (fallbackError) {
    // If even fallback fails, track as failed
    this.logger.error(
      'Failed to create fallback chunk',
      fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
      { filePath: file.relativePath }
    );
    
    failedFiles.push({
      filePath: file.relativePath,
      error: `Parser failed: ${errorMessage}. Fallback also failed: ${fallbackError}`,
    });
  }
}
```

## Recommendation

Implement **Option A immediately** (explicit failure tracking) to make the problem visible.

Implement **Option B as follow-up** (fallback chunking) to improve robustness, but only after:
1. Understanding why the C# parser fails
2. Determining if fallback chunks provide value
3. Testing performance impact of reading full files on error

## Testing

1. Add integration test with LapCollector.cs
2. Verify rescan reports `filesFailed: 1`
3. Verify MCP response includes failure message
4. Verify logs show ERROR level message
5. Test with other problematic files

## Timeline

- **Today**: Implement Option A (2-3 hours)
- **This week**: Add tests and validation
- **Next sprint**: Investigate C# parser issue, consider Option B
