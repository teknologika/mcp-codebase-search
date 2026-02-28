# Chunk Path Normalization Fix

## Problem
`get_chunk_content` tool was failing with error:
```
Chunk not found: SimhubPlugin/PitStore.cs:133-171 in codebase 'apr-simhub-dashsupport'
```

## Root Cause
- During ingestion, chunks are stored with **relative paths** (e.g., `SimhubPlugin/PitStore.cs`)
- Search results can return **absolute paths** (e.g., `/Users/bruce/GitHub/APR-Simhub-DashSupport/SimhubPlugin/PitStore.cs`)
- `getChunkContent` was querying the database with the exact path from search results
- Path mismatch caused chunk lookup to fail

## Solution
Modified `getChunkContent` in `src/domains/codebase/codebase.service.ts` to:
1. Detect if the incoming file path is absolute
2. If absolute, convert to relative path using the codebase's root path
3. Query the database with the normalized relative path

## Changes
- Extended `getChunkContent` method with path normalization logic
- Uses existing `getCodebasePath` method to get codebase root
- Falls back to original path if normalization fails
- Added debug logging for path normalization

## Testing
- Build successful
- Codebase index updated
- Fix handles both relative and absolute paths consistently
