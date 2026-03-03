# Zero-Chunk Bug Fix Plan

## Problem
Files can be silently skipped during rescan if:
1. Tree-sitter parser returns 0 chunks
2. Full file content read fails or is undefined

Result: File counted as "added" but has 0 chunks, making it invisible to search.

## Current Code Flow (ingestion.service.ts ~line 800-850)
```typescript
// 1. Try to read full file
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

// 2. Parse with tree-sitter
let chunks = await this.parseFileWithAppropriateParser(file.path, file.language as any);

// 3. Fallback if parser returned 0 chunks
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
    filePath: file.relativePath,
  }];
}

// 4. If chunks is STILL empty, this silently skips the file!
const chunksWithMetadata = chunks.map((chunk, index) => ({ ... }));
allChunks.push(...chunksWithMetadata);
```

## Fix Strategy

### Option 1: Always Create Fallback Chunk (RECOMMENDED)
If parser returns 0 chunks, ALWAYS read the file and create a fallback chunk, regardless of `storeFullFiles` setting.

```typescript
let chunks = await this.parseFileWithAppropriateParser(file.path, file.language as any);

// If no chunks were extracted, ALWAYS create a file-level chunk
if (chunks.length === 0) {
  this.logger.warn('No chunks extracted by parser, creating file-level fallback chunk', {
    filePath: file.relativePath,
    language: file.language,
  });
  
  // Read file if we haven't already
  if (!fullFileContent) {
    try {
      fullFileContent = await readFile(file.path, 'utf-8');
    } catch (error) {
      // This is now a CRITICAL error - we can't index the file at all
      throw new IngestionError(
        `Failed to parse file and unable to read content for fallback: ${file.relativePath}`,
        error
      );
    }
  }
  
  const lineCount = fullFileContent.split('\n').length;
  chunks = [{
    content: fullFileContent,
    startLine: 1,
    endLine: lineCount,
    chunkType: 'file' as const,
    language: file.language as any,
    filePath: file.relativePath,
  }];
}
```

### Option 2: Explicit Error on Zero Chunks
Throw an error if we end up with 0 chunks after all fallback attempts.

```typescript
if (chunks.length === 0) {
  throw new IngestionError(
    `Unable to extract any chunks from file: ${file.relativePath}. ` +
    `Parser returned 0 chunks and fallback failed.`
  );
}
```

### Option 3: Track and Report Zero-Chunk Files
Add a new field to RescanResult to explicitly track files that couldn't be chunked.

```typescript
interface RescanResult {
  // ... existing fields
  filesSkipped: number;  // NEW: files that couldn't be chunked
  skippedFiles: string[]; // NEW: list of skipped file paths
}
```

## Recommended Approach
Combine Option 1 + Option 3:
1. Always attempt to create fallback chunk when parser returns 0
2. If fallback also fails, catch the error and track as "skipped"
3. Report skipped files in rescan results
4. Log ERROR (not warn) for each skipped file

## Implementation Steps
1. Modify rescan logic to always create fallback chunks
2. Add proper error handling with explicit logging
3. Add `filesSkipped` tracking to RescanResult
4. Update tests to cover zero-chunk scenarios
5. Add integration test with a file that causes parser to return 0 chunks

## Testing
1. Create test file that tree-sitter can't parse (malformed syntax)
2. Create test file that's too large
3. Create test file with encoding issues
4. Verify all cases either produce chunks or explicit errors
5. Verify rescan results accurately report skipped files
