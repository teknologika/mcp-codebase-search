# Codebase Metadata Table Design

## Problem
Currently, codebase metadata (path, lastIngestion, languages, etc.) is stored in the first row of each codebase's chunk table. This causes:
- Corrupted/empty tables return invalid metadata
- Slow metadata queries (must open each table)
- No way to track codebase updates vs ingestion dates
- Difficult to validate table integrity

## Solution
Create a separate `_codebase_metadata` table that stores all codebase information.

## Schema

```typescript
interface CodebaseMetadata {
  // Identity
  name: string;                    // Unique codebase name
  path: string;                    // Absolute path to codebase directory
  
  // Timestamps
  createdAt: string;               // ISO 8601 - when first ingested
  lastIngested: string;            // ISO 8601 - last successful ingestion
  lastModified: string;            // ISO 8601 - last file modification in codebase
  
  // Statistics
  chunkCount: number;              // Total chunks
  fileCount: number;               // Total files processed
  sizeBytes: number;               // Total size of all chunks
  
  // Language breakdown
  languages: Array<{
    language: string;
    fileCount: number;
    chunkCount: number;
  }>;
  
  // Chunk type breakdown
  chunkTypes: Array<{
    type: string;
    count: number;
  }>;
  
  // Configuration
  schemaVersion: string;           // Schema version used
  tableName: string;               // LanceDB table name
  
  // Status
  status: 'active' | 'corrupted' | 'empty';
  lastError?: string;              // Last error message if any
}
```

## Implementation Plan

### Phase 1: Create Metadata Table
1. Add `createMetadataTable()` method to LanceDBClient
2. Initialize on first use (lazy creation)
3. Add CRUD operations for metadata

### Phase 2: Update Ingestion Service
1. After successful ingestion, write/update metadata entry
2. On ingestion start, read metadata to check for existing codebase
3. Update `lastModified` by checking file mtimes in directory
4. Set status to 'corrupted' if ingestion fails

### Phase 3: Update Codebase Service
1. Read from metadata table instead of chunk tables
2. Add validation: check if chunk table exists and matches metadata
3. Add repair operation: detect and fix corrupted codebases

### Phase 4: Add New Features
1. Show "last modified" vs "last ingested" in UI
2. Highlight codebases that need re-scanning (modified > ingested)
3. Add health check endpoint
4. Add metadata export/import for backup

## Benefits

1. **Reliability**: Metadata always accessible even if chunk table is corrupted
2. **Performance**: Single table query for all codebases
3. **Tracking**: Know when codebase was last modified vs ingested
4. **Validation**: Easy to detect and repair corrupted codebases
5. **Features**: Enable auto-rescan detection, health monitoring

## Migration Strategy

1. Create metadata table on first use
2. Populate from existing chunk tables (best effort)
3. Mark any unreadable tables as 'corrupted'
4. Gradually migrate all operations to use metadata table
5. Keep backward compatibility for one version

## Files to Modify

- `src/infrastructure/lancedb/lancedb.client.ts` - Add metadata table operations
- `src/domains/ingestion/ingestion.service.ts` - Write metadata after ingestion
- `src/domains/codebase/codebase.service.ts` - Read from metadata table
- `src/shared/types/index.ts` - Add CodebaseMetadata type

## Testing

- Test metadata CRUD operations
- Test migration from old format
- Test corrupted table detection
- Test auto-rescan detection (lastModified > lastIngested)
