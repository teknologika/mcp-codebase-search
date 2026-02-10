# MCP Tool Schemas

This directory contains the JSON schemas for all MCP (Model Context Protocol) tools exposed by the codebase memory server.

## Overview

The MCP tool schemas define the input validation rules and output formats for each tool available to MCP clients (like Claude Desktop). Each schema includes:

- **Tool name**: Unique identifier for the tool
- **Description**: Human-readable explanation of what the tool does
- **Input schema**: JSON schema defining required and optional parameters with validation rules
- **Output schema**: JSON schema defining the structure of successful responses

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
    lastIngestion: string; // ISO 8601 timestamp
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
      lastIngestion: '2024-01-15T10:30:00Z',
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
}
```

**Output**:
```typescript
{
  results: Array<{
    filePath: string;
    startLine: number;        // 1-indexed
    endLine: number;          // 1-indexed
    language: string;
    chunkType: string;        // function | class | method | interface | property | field
    content: string;
    similarityScore: number;  // 0-1
    codebaseName: string;
  }>;
  totalResults: number;
  queryTime: number;          // milliseconds
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
  maxResults: 25
};

// Expected output
const output = {
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
  lastIngestion: string;    // ISO 8601 timestamp
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
  lastIngestion: '2024-01-15T10:30:00Z',
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

### 4. `open_codebase_manager`

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
- `lastIngestion`: Must be valid ISO 8601 date-time format
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
