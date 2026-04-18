# MCP Tool Schemas

This directory contains the JSON schemas for all MCP (Model Context Protocol) tools exposed by the codebase memory server.

## Overview

The MCP tool schemas define the input validation rules and output formats for each tool available to MCP clients (like Claude Desktop). Each schema includes:

- **Tool name**: Unique identifier for the tool
- **Description**: Human-readable explanation of what the tool does
- **Input schema**: JSON schema defining required and optional parameters with validation rules
- **Output schema**: JSON schema defining the structure of successful responses

## MCP Call Shape

MCP clients discover tools with `tools/list` and execute them with `tools/call`.

For `search_codebases`, the tool arguments look like this:

```json
{
  "name": "search_codebases",
  "arguments": {
    "query": "codebase search"
  }
}
```

The bare object `{ "query": "codebase search" }` is only the tool arguments payload, not the full MCP request.

## Available Tools

### 1. `list_codebases`

Lists all indexed codebases with their metadata.

**Input**: None

**Output**:
```typescript
{
  codebases: Array<{
    name: string;
    path: string;
    chunkCount: number;
    fileCount: number;
    lastIngested?: string; // ISO 8601 timestamp
    lastModified: string; // ISO 8601 timestamp
    lastScanAge?: number; // Seconds since last ingest/rescan
    lastRescanChangedAt?: string; // ISO 8601 timestamp
    lastRescanFilesChanged?: number;
    lastRescanFilesAdded?: number;
    lastRescanFilesModified?: number;
    lastRescanFilesDeleted?: number;
    lastRescanChangedFilePaths?: string[];
    languages: string[];
  }>;
}
```

**Example Usage**:
```typescript
import { LIST_CODEBASES_SCHEMA } from './tool-schemas.js';

// The tool requires no input
const input = {};

// Expected output
const output = {
  codebases: [
    {
      name: 'my-project',
      path: '/path/to/project',
      chunkCount: 1500,
      fileCount: 200,
      lastIngested: '2024-01-15T10:30:00Z',
      lastModified: '2024-01-15T10:30:00Z',
      lastScanAge: 57,
      lastRescanChangedAt: '2024-01-15T10:30:00Z',
      lastRescanFilesChanged: 4,
      lastRescanFilesAdded: 1,
      lastRescanFilesModified: 2,
      lastRescanFilesDeleted: 1,
      lastRescanChangedFilePaths: ['src/a.ts', 'src/b.ts'],
      languages: ['typescript', 'javascript', 'python']
    }
  ]
};
```

### 2. `search_codebases`

Performs semantic search across indexed codebases.

**Input**:
```typescript
{
  query: string;              // Required: Search query (min length: 1)
  codebaseName?: string;      // Optional: Filter by codebase
  language?: string;          // Optional: Filter by language (enum)
  maxResults?: number;        // Optional: Max results (1-200, default: 50)
  includeContent?: boolean;   // Optional: Include full source for all results
  topContentResults?: number; // Optional: Include full source for the top N results
}
```

**Output**:
```typescript
{
  query: string;
  results: Array<{
    filePath: string;
    startLine: number;        // 1-indexed
    endLine: number;          // 1-indexed
    language: string;
    chunkType: string;        // function | class | method | interface | property | field
    similarityScore: number;  // 0-1
    content?: string;
    codebaseName?: string;
  }>;
  totalResults: number;
  queryTime: number;          // milliseconds
  staleWarning?: string;
}
```

**Example Usage**:
```typescript
import { SEARCH_CODEBASES_SCHEMA } from './tool-schemas.js';

// Search with all optional parameters
const input = {
  query: 'authentication function',
  codebaseName: 'my-project',
  language: 'typescript',
  maxResults: 25,
  includeContent: false,
  topContentResults: 3
};

// Expected output
const output = {
  query: 'authentication function',
  results: [
    {
      filePath: 'src/auth/authenticate.ts',
      startLine: 15,
      endLine: 45,
      language: 'typescript',
      chunkType: 'function',
      content: 'export async function authenticate(credentials: Credentials) { ... }',
      similarityScore: 0.92,
      codebaseName: 'my-project'
    }
  ],
  totalResults: 1,
  queryTime: 45
};
```

### 3. `get_codebase_stats`

Retrieves detailed statistics for a specific codebase.

**Input**:
```typescript
{
  name: string;  // Required: Codebase name (min length: 1)
}
```

**Output**:
```typescript
{
  name: string;
  path: string;
  chunkCount: number;
  fileCount: number;
  lastIngested?: string;    // ISO 8601 timestamp
  lastModified: string;     // ISO 8601 timestamp
  lastScanAge?: number;     // Seconds since last ingest/rescan
  lastRescanChangedAt?: string;
  lastRescanFilesChanged?: number;
  lastRescanFilesAdded?: number;
  lastRescanFilesModified?: number;
  lastRescanFilesDeleted?: number;
  lastRescanChangedFilePaths?: string[];
  languages: Array<{
    language: string;
    fileCount: number;
    chunkCount: number;
  }>;
  chunkTypes: Array<{
    type: string;           // function | class | method | interface | property | field
    count: number;
  }>;
  sizeBytes: number;
}
```

**Example Usage**:
```typescript
import { GET_CODEBASE_STATS_SCHEMA } from './tool-schemas.js';

const input = {
  name: 'my-project'
};

const output = {
  name: 'my-project',
  path: '/path/to/project',
  chunkCount: 1500,
  fileCount: 200,
  lastIngested: '2024-01-15T10:30:00Z',
  lastModified: '2024-01-15T10:30:00Z',
  lastScanAge: 57,
  lastRescanChangedAt: '2024-01-15T10:30:00Z',
  lastRescanFilesChanged: 4,
  lastRescanFilesAdded: 1,
  lastRescanFilesModified: 2,
  lastRescanFilesDeleted: 1,
  lastRescanChangedFilePaths: ['src/a.ts', 'src/b.ts'],
  languages: [
    { language: 'typescript', fileCount: 150, chunkCount: 1200 },
    { language: 'javascript', fileCount: 30, chunkCount: 200 },
    { language: 'python', fileCount: 20, chunkCount: 100 }
  ],
  chunkTypes: [
    { type: 'function', count: 800 },
    { type: 'class', count: 300 },
    { type: 'method', count: 400 }
  ],
  sizeBytes: 2500000
};
```

### 4. `get_file_content`

Retrieves the complete content of an indexed file.

**Input**:
```typescript
{
  codebaseName: string;
  filePath: string;
}
```

**Output**:
```typescript
{
  codebaseName: string;
  filePath: string;
  language: string;
  content: string;
  chunkCount: number;
  totalLines: number;
}
```

### 5. `get_chunk_content`

Retrieves the content for a specific indexed chunk using a codebase name, file path, and line range.

**Input**:
```typescript
{
  codebaseName: string;
  filePath: string;
  startLine: number;
  endLine: number;
}
```

**Output**:
```typescript
{
  codebaseName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  chunkType: string;
  content: string;
  lineNumberDrift?: number;
  staleWarning?: string;
}
```

### 6. `list_files`

Lists all indexed files in a codebase with metadata.

**Input**:
```typescript
{
  codebaseName: string;
}
```

**Output**:
```typescript
{
  files: Array<{
    filePath: string;
    language: string;
    chunkCount: number;
    fileMtime: string;
    sizeBytes: number;
    isTestFile: boolean;
    isLibraryFile: boolean;
  }>;
  codebaseName: string;
  totalFiles: number;
}
```

### 7. `update_codebase_scan`

Incrementally refreshes a codebase index after file changes.

**Input**:
```typescript
{
  name: string;
  verbose?: boolean;
}
```

**Output**:
```typescript
{
  request: {
    name: string;
    verbose: boolean;
  };
  name: string;
  path: string;
  filesScanned: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesUnchanged: number;
  filesIndexed: number;
  filesDropped: number;
  chunksAdded: number;
  chunksDeleted: number;
  lastChangedFiles?: number;
  lastChangedAt?: string;
  lastChangedFilePaths: string[];
  cacheCleared: boolean;
  durationMs: number;
  message: string;
}
```

`filesIndexed` reports the number of unique files present in the index after the rescan. `filesDropped` highlights the gap between supported files scanned from disk and files that actually landed in the index.
`lastChangedFiles`, `lastChangedAt`, and `lastChangedFilePaths` preserve the most recent meaningful rescan summary, even if a follow-up refresh finds no further diff.

### 8. `get_adjacent_chunks`

Retrieves the chunks immediately before and after a specific chunk in a file.

**Input**:
```typescript
{
  codebaseName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  before?: number;
  after?: number;
}
```

**Output**:
```typescript
{
  before: Array<{
    startLine: number;
    endLine: number;
    chunkType: string;
    content: string;
  }>;
  reference: {
    startLine: number;
    endLine: number;
    chunkType: string;
  } | null;
  after: Array<{
    startLine: number;
    endLine: number;
    chunkType: string;
    content: string;
  }>;
}
```

### 9. `open_codebase_manager`

Opens the web-based codebase manager UI in the default browser.

**Input**: None

**Output**:
```typescript
{
  url: string;      // URI format
  message: string;
}
```

**Example Usage**:
```typescript
import { OPEN_CODEBASE_MANAGER_SCHEMA } from './tool-schemas.js';

const input = {};

const output = {
  url: 'http://localhost:8008',
  message: 'Manager UI opened in default browser'
};
```

## Validation

All schemas are designed to work with [AJV](https://ajv.js.org/) (Another JSON Schema Validator) for input validation and output verification.

### Validating Input

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { SEARCH_CODEBASES_SCHEMA } from './tool-schemas.js';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.inputSchema);

const input = {
  query: 'authentication',
  maxResults: 25
};

if (validate(input)) {
  console.log('Input is valid');
} else {
  console.error('Validation errors:', validate.errors);
}
```

### Validating Output

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { SEARCH_CODEBASES_SCHEMA } from './tool-schemas.js';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.outputSchema);

const output = {
  query: 'authentication function',
  results: [...],
  totalResults: 10,
  queryTime: 45
};

if (validate(output)) {
  console.log('Output is valid');
} else {
  console.error('Validation errors:', validate.errors);
}
```

## Validation Rules

### Common Rules

- **No additional properties**: All schemas have `additionalProperties: false` to prevent unexpected fields
- **Required fields**: Fields marked as required must be present
- **Type checking**: All fields must match their specified type

### Specific Rules

#### String Fields
- `query` (search_codebases): Minimum length 1
- `name` (get_codebase_stats): Minimum length 1

#### Numeric Fields
- `chunkCount`, `fileCount`: Minimum 0
- `startLine`, `endLine`: Minimum 1 (line numbers are 1-indexed)
- `similarityScore`: Range 0-1 (inclusive)
- `maxResults`: Range 1-200 (inclusive)
- `queryTime`: Minimum 0

#### Enum Fields
- `language`: Must be one of: `csharp`, `java`, `javascript`, `typescript`, `python`
- `chunkType`: Must be one of: `function`, `class`, `method`, `interface`, `property`, `field`

#### Format Fields
- `lastIngested`: Must be valid ISO 8601 date-time format
- `url`: Must be valid URI format

## TypeScript Types

The module exports TypeScript interfaces for all input and output types:

```typescript
import type {
  ListCodebasesInput,
  ListCodebasesOutput,
  SearchCodebasesInput,
  SearchCodebasesOutput,
  GetCodebaseStatsInput,
  GetCodebaseStatsOutput,
  OpenCodebaseManagerInput,
  OpenCodebaseManagerOutput,
} from './tool-schemas.js';
```

These types can be used for type-safe tool implementations.

## Testing

Comprehensive unit tests are available in `__tests__/tool-schemas.test.ts`. The tests verify:

- Schema structure and required properties
- Input validation rules
- Output validation rules
- Parameter descriptions
- Enum constraints
- Numeric ranges
- AJV compilation

Run tests with:
```bash
npm test -- src/infrastructure/mcp/__tests__/tool-schemas.test.ts
```

## MCP Protocol Compliance

These schemas are designed to comply with the Model Context Protocol specification:

1. **Tool Advertisement**: Schemas can be advertised to MCP clients on server startup
2. **Input Validation**: Input schemas validate parameters before tool execution
3. **Output Format**: Output schemas ensure consistent response structure
4. **Error Handling**: Validation failures can be converted to MCP-compliant error responses

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [AJV JSON Schema Validator](https://ajv.js.org/)
- [JSON Schema Specification](https://json-schema.org/)

## Requirements

Validates: **Requirements 15.1** - MCP Protocol Compliance
