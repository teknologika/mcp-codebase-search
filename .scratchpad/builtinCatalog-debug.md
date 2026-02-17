# Debug: builtinCatalog.ts Not Being Indexed

## Issue Summary
The file `/Users/bruce/GitHub/chisel/src/tools/builtinCatalog.ts` exists on disk but is not being indexed by the codebase-search ingestion process.

## Evidence

### File Exists on Disk
- Path: `/Users/bruce/GitHub/chisel/src/tools/builtinCatalog.ts`
- Size: 1.2K (1,200 bytes)
- Last modified: 2026-02-17 21:58:48
- Content: Valid TypeScript with export statement

### Not in Database
- `list_files` for chisel codebase shows 106 files
- `builtinCatalog.ts` is NOT in the list
- `get_file_content` returns "File not found"
- Semantic search doesn't return chunks from this file

### Ingestion Attempts
1. Initial ingestion at 21:39:19 - file may not have existed yet
2. Update scan at 21:42:53 - reported 120 files, 551 chunks
3. Database still shows 106 files from 21:42:53 ingestion

### Hypothesis
The file is being scanned but **fails to parse** or **produces zero chunks**, so it's not stored in the database.

## File Content
```typescript
import type { ToolCatalogEntry } from '../core/types.js';

export const BUILTIN_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    schema: {
      name: 'list_directory',
      description:
        'Lists the visible files and directories directly inside a given directory, ' +
        'one level deep. Returns an array of entry names sorted alphabetically. ' +
        'Hidden entries (names starting with ".") are never included. ' +
        'Does not recurse. Does not return metadata or distinguish files from directories. ' +
        'Use this to orient yourself in the project before reading or modifying files.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Relative path to the directory, from the project root. ' +
              'Must not be absolute. Must not contain hidden segments (e.g. ".git"). ' +
              'Use "." to list the project root itself.',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
    exposureClass: 'domain_read',
    hotnessByMode: { default: 'hot', planning: 'hot', autonomous: 'hot' },
  },
];
```

## Root Cause CONFIRMED ✓

The file is being scanned and parsed successfully, but produces **zero chunks** because:

1. The file contains only:
   - `import_statement` 
   - `export_statement` with `lexical_declaration` (const)

2. The tree-sitter parser only extracts these TypeScript node types:
   - `function_declaration`
   - `arrow_function`
   - `class_declaration`
   - `method_definition`
   - `interface_declaration`

3. Since `lexical_declaration` (const/let/var) is not in the mapping, no chunks are created

4. Files with zero chunks are not stored in the database

## Impact

This affects ANY file containing only:
- Exported constants
- Type definitions
- Enums
- Configuration objects
- Small utility exports without functions

## Solution

See `.scratchpad/builtinCatalog-solution.md` for detailed implementation plan.

**Quick summary:**
1. Add `lexical_declaration`, `type_alias_declaration`, `enum_declaration` to NODE_TYPE_MAPPINGS
2. Add file-level fallback for files that still produce zero chunks
3. Update ChunkType to include 'export', 'type', 'enum', 'file'
4. Re-scan all codebases after implementation

## Related Code
- Ingestion: `src/domains/ingestion/ingestion.service.ts`
- Parsing: `src/domains/parsing/tree-sitter-parsing.service.ts` (LINE 26-58: NODE_TYPE_MAPPINGS)
- Types: `src/shared/types/index.ts` (ChunkType definition)

## Context
This issue was discovered while testing the new `fullFileContent` feature. The fullFileContent feature is working correctly - this is a separate pre-existing issue with chunk extraction.
