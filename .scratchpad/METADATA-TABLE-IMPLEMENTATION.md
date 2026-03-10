# Metadata Table Implementation Summary

## Overview
Implemented a separate metadata table (`_codebase_metadata`) to store codebase statistics and information, solving the issue where corrupted/empty chunk tables caused metadata retrieval failures.

## Changes Made

### 1. LanceDB Client (`src/infrastructure/lancedb/lancedb.client.ts`)
Added metadata table management methods:
- `METADATA_TABLE_NAME` constant: `'_codebase_metadata'`
- `getOrCreateMetadataTable()`: Lazy initialization of metadata table
- `getMetadata(codebaseName)`: Retrieve metadata for a specific codebase
- `setMetadata(metadata)`: Create or update metadata entry
- `deleteMetadata(codebaseName)`: Remove metadata entry
- `listAllMetadata()`: Get all codebase metadata

### 2. Codebase Service (`src/domains/codebase/codebase.service.ts`)
Updated to use metadata table:
- `listCodebases()`: Now reads from metadata table first, falls back to chunk tables for backward compatibility
- `deleteCodebase()`: Also deletes metadata entry when deleting a codebase
- Detects corrupted codebases and marks them with status 'corrupted'

### 3. Ingestion Service (`src/domains/ingestion/ingestion.service.ts`)
Added metadata writing after ingestion:
- `writeMetadata()`: New private method to write/update metadata after successful ingestion
- `ingestCodebase()`: Calls `writeMetadata()` after storing chunks (Phase 6)
- `rescanCodebase()`: Updates metadata after rescan with recalculated statistics

### 4. Type Definitions (`src/shared/types/index.ts`)
Extended `CodebaseMetadata` interface with new fields:
- `createdAt?: string` - When first ingested
- `lastModified?: string` - Last file modification in codebase
- `tableName?: string` - LanceDB table name
- `status?: 'active' | 'corrupted' | 'empty'` - Codebase health status
- `lastError?: string` - Last error message if any

## Benefits

1. **Reliability**: Metadata always accessible even if chunk table is corrupted
2. **Performance**: Single table query for all codebases instead of opening each chunk table
3. **Tracking**: Know when codebase was last modified vs ingested
4. **Validation**: Easy to detect and mark corrupted codebases
5. **Backward Compatibility**: Falls back to reading from chunk tables if metadata table doesn't exist

## Metadata Table Schema

```typescript
{
  name: string;              // Codebase name (unique)
  path: string;              // Absolute path to codebase
  createdAt: string;         // ISO 8601 - first ingestion
  lastIngested: string;      // ISO 8601 - last successful ingestion
  lastModified: string;      // ISO 8601 - last file modification
  chunkCount: number;        // Total chunks
  fileCount: number;         // Total files
  sizeBytes: number;         // Total size
  languages: JSON[];         // Language statistics
  chunkTypes: JSON[];        // Chunk type statistics
  schemaVersion: string;     // Schema version
  tableName: string;         // LanceDB table name
  status: string;            // 'active' | 'corrupted' | 'empty'
  lastError?: string;        // Error message if any
}
```

## Migration Strategy

1. Metadata table is created lazily on first use
2. `listCodebases()` tries metadata table first, falls back to chunk tables
3. New ingestions automatically write to metadata table
4. Rescans update metadata table
5. Corrupted codebases are detected and marked

## Testing Needed

1. Test fresh ingestion writes metadata
2. Test rescan updates metadata
3. Test listCodebases reads from metadata table
4. Test backward compatibility with old codebases
5. Test corrupted codebase detection
6. Test metadata deletion when codebase is deleted

## Next Steps

1. Build and restart MCP server
2. Test with existing chisel-desktop codebase
3. Test fresh ingestion of a new codebase
4. Verify metadata is written and readable
5. Test rescan updates metadata correctly
