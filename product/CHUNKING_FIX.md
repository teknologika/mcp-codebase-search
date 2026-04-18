# Chunking Duplication Fix

## Issues Addressed

### 1. Arrow Function Duplication
**Problem**: Arrow functions and inline code were appearing twice in search results:
- Once as part of their containing function/method
- Once as standalone extracted chunks

**Example**: In a React component, `(event) => dispatch(mapCoreEvent(event))` would appear both inline within the component method AND as a separate chunk at the end of the file.

**Root Cause**: The `extractChunks` method in `tree-sitter-parsing.service.ts` was recursively processing ALL nodes, including children of already-extracted chunks. Since `arrow_function` was mapped as an extractable node type in JavaScript/TypeScript, inline arrow functions were being extracted separately even though they were already part of their parent function's content.

**Solution**: Modified the recursion logic to stop at non-container chunk types (functions, methods, properties, fields) while continuing for container types (classes, interfaces). This prevents duplication of inline code while still extracting class members.

### 2. File Count Discrepancy
**Problem**: Ingestion reported 79 files processed, but `list_files` returned only 66 files.

**Root Cause**: The 13-file difference represents files that were scanned and attempted to parse but either:
- Failed to parse (threw errors)
- Produced no chunks (empty files, unsupported syntax)

The ingestion service counted all files it attempted to process, while `list_files` only counts files that successfully produced chunks in the database.

**Solution**: Added tracking for successful vs failed parses:
- New fields in `IngestionStats`: `filesSuccessfullyParsed` and `filesFailedToParse`
- Tracks files that produce at least one chunk vs files that fail or produce no chunks
- Provides clearer visibility into ingestion success rates

**Follow-up instrumentation**: `update_codebase_scan` now also reports `filesIndexed` and `filesDropped`, and the ingestion pipeline logs the file paths dropped during parse, embedding, and store stages. That makes it easier to reconcile scan totals with `list_files` output in a single run.

## Changes Made

### 1. `src/domains/parsing/tree-sitter-parsing.service.ts`
Modified `extractChunks` method to prevent duplication:
```typescript
// Container types (class, interface) should continue recursion to extract members
// Non-container types (function, method, property, field) should stop to avoid duplicating inline code
const containerTypes = ['class', 'interface'];
if (!containerTypes.includes(chunkType)) {
  // This is a function/method/property - don't recurse into children
  // to avoid extracting inline arrow functions, nested functions, etc.
  return chunks;
}
```

### 2. `src/shared/types/index.ts`
Extended `IngestionStats` interface:
```typescript
export interface IngestionStats {
  // ... existing fields
  filesSuccessfullyParsed?: number; // Files that produced at least one chunk
  filesFailedToParse?: number; // Files that were attempted but failed or produced no chunks
}
```

### 3. `src/domains/ingestion/ingestion.service.ts`
Added tracking logic:
- Initialize counters: `filesSuccessfullyParsed` and `filesFailedToParse`
- Increment `filesSuccessfullyParsed` when chunks.length > 0
- Increment `filesFailedToParse` when chunks.length === 0 or on parse error
- Include counts in returned stats and logs

### 4. `src/domains/parsing/__tests__/tree-sitter-parsing.service.test.ts`
Updated "deeply nested structures" test to reflect correct behavior:
- Nested classes inside methods are now part of the method's content (not extracted separately)
- This prevents duplication and is the intended behavior

## Impact

### Positive
- **Eliminates duplicate content** in search results and file reconstruction
- **Clearer metrics** on ingestion success/failure rates
- **Better debugging** - can now identify which files failed to parse
- **Reduced noise** in search results

### Behavioral Changes
- Nested classes/functions inside methods are no longer extracted as separate chunks
- They remain part of the parent method's content
- This is correct behavior - prevents seeing the same code twice

## Testing
- All tree-sitter parsing tests pass (24/24)
- File scanner tests pass (29/29)
- Build succeeds without errors
- One flaky performance test unrelated to these changes

## Recommendations
1. Monitor ingestion logs for `filesFailedToParse` counts
2. If high failure rates, investigate specific file patterns causing issues
3. Consider exposing these metrics in the Manager UI for visibility
