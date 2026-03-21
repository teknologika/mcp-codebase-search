# @teknologika/mcp-codebase-search

> A local-first semantic search system for codebases using the Model Context Protocol (MCP)

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [MCP Client Configuration](#mcp-client-configuration)
- [Supported Languages](#supported-languages)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Overview

The Codebase Memory MCP Server enables LLM coding assistants to reliably discover existing code in a codebase, preventing duplicate implementations and wrong-file edits. It uses local embeddings, Tree-sitter-aware chunking, and LanceDB for vector storage — all running locally without cloud dependencies.

### Why Use This?

- **Prevent Duplicate Code**: AI assistants can find existing implementations before creating new ones
- **Accurate Code Navigation**: Semantic search understands code meaning, not just keywords
- **Privacy-First**: All processing happens locally — your code never leaves your machine
- **Fast & Efficient**: Optimised for quick search responses with intelligent caching
- **Multi-Language**: Support for TypeScript, JavaScript, Python, Java, C#, Svelte, HTML, CSS, Markdown, and more
- **Smart Filtering**: Exclude test files and library code from search results
- **Staleness Detection**: Automatic warnings when the index may be out of date

## Features

- 🔒 **Local-First**: All operations run locally without external API calls
- 🔍 **Semantic Search**: Find code by meaning, not just keywords
- 🌳 **Tree-sitter Parsing**: AST-aware code chunking for meaningful results
- 🤖 **MCP Integration**: Seamless integration with MCP-compatible AI assistants (Claude, Kiro, etc.)
- 🌐 **Multi-Language Support**: TypeScript, JavaScript, Python, Java, C#, Svelte, HTML, CSS, YAML, Markdown
- 🖥️ **Web Management UI**: Manage indexed codebases through a browser interface
- ⚡ **Performance Optimised**: Fast search responses with intelligent result caching
- 🎯 **Smart Filtering**: Exclude test files and library code from results
- 📊 **Detailed Statistics**: Track chunk counts, file counts, language distribution, and scan age
- 🔄 **Incremental Rescans**: Hash-based change detection — only re-indexes modified files
- 🚫 **Lock File Exclusion**: Automatically excludes `package-lock.json`, `yarn.lock`, and other lock files
- ⚠️ **Staleness Warnings**: Search results include warnings when the index is more than 10 minutes old

## Installation

### Global Installation (Recommended)

```bash
npm install -g @teknologika/mcp-codebase-search
```

This makes three commands available globally:
- `mcp-codebase-search` — MCP server for AI assistants
- `mcp-codebase-ingest` — CLI for indexing codebases
- `mcp-codebase-manager` — Web UI for management

### Local Installation

```bash
npm install @teknologika/mcp-codebase-search
```

Then use with `npx`:
```bash
npx mcp-codebase-ingest --path ./my-project --name my-project
npx mcp-codebase-search
npx mcp-codebase-manager
```

### Requirements

- **Node.js**: 22.0.0 or higher
- **npm**: 10.0.0 or higher
- **Disk Space**: ~500MB for embedding models (downloaded on first use)

## Quick Start

### 1. Index Your First Codebase

```bash
mcp-codebase-ingest --path ./my-project --name my-project
```

**Example Output:**
```
Ingesting codebase: my-project
Path: /Users/dev/projects/my-project

Scanning directory...
Parsing files...
Generating embeddings...
Storing chunks...

✓ Ingestion completed successfully!

  Total files scanned: 256
  Supported files: 253
  Chunks created: 2,022
  Duration: 29.7s

Languages detected:
  typescript: 1,800 chunks (200 files)
  javascript: 150 chunks (40 files)
  markdown: 72 chunks (13 files)
```

### 2. Configure Your MCP Client

#### For Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "codebase-search": {
      "command": "mcp-codebase-search",
      "args": []
    }
  }
}
```

### 3. Set Up Your Agents.md

Add an `AGENTS.md` file to your project to instruct AI assistants to use codebase search tools before creating new code:

```md
# AGENTS.md — Codebase Dedupe Protocol

## Goal
Prevent duplicate implementations and "wrong file" edits by making **codebase-search** the *only valid source* for claims about what already exists in this repo during this session.

## Tools you MUST use for codebase discovery
- `list_codebases`
- `search_codebases`
- `get_chunk_content`
- `get_codebase_stats`

After updates run `update_codebase_scan` to refresh the index.

## Hard rule: No creation without a Dedupe Ticket
Before adding a new file, module, class, function, or helper, produce a Dedupe Ticket:

**Dedupe Ticket**
- Intent signature: `<one sentence describing what you are about to add>`
- Queries: `<2–4 searches you will run>`
- Top matches: `<up to 5 file paths returned by the tool>`
- Decision: `reuse | extend | new`
- Rationale: `<why>`

## Graceful degradation
If the MCP server is unavailable: state **DEGRADED MODE** and stop before making changes.
```

### 4. Start Using in Your AI Assistant

Once configured, your AI assistant can use these tools:

- **list_codebases** — See all indexed codebases with scan age
- **search_codebases** — Semantic search with staleness warnings
- **get_codebase_stats** — Detailed statistics for a codebase
- **get_chunk_content** — Retrieve specific code chunks by line range
- **get_file_content** — Retrieve complete file content
- **list_files** — List all indexed files in a codebase
- **update_codebase_scan** — Incrementally refresh the index after code changes
- **open_codebase_manager** — Launch the Manager UI in your browser

### 5. (Optional) Explore the Manager UI

```bash
mcp-codebase-manager
```

Opens `http://localhost:8008` in your default browser with a visual interface for:
- Searching codebases with filters
- Managing indexed codebases
- Viewing statistics and file-level details
- Adding new codebases with real-time progress tracking
- Rescanning for changes


## Usage

### Ingestion CLI

The `mcp-codebase-ingest` command indexes a codebase for semantic search.

#### Basic Usage

```bash
mcp-codebase-ingest --path <directory> --name <codebase-name>
```

#### Options

| Option | Description | Required | Example |
|--------|-------------|----------|---------|
| `-p, --path` | Path to codebase directory | Yes | `--path ./my-project` |
| `-n, --name` | Unique name for the codebase | Yes | `--name my-project` |
| `-c, --config` | Path to configuration file | No | `--config ./config.json` |
| `--no-gitignore` | Disable .gitignore filtering | No | `--no-gitignore` |

#### Examples

```bash
# Index a local project
mcp-codebase-ingest --path ~/projects/my-app --name my-app

# Index with custom config
mcp-codebase-ingest --path ./backend --name backend-api --config ./custom-config.json

# Index without gitignore filtering
mcp-codebase-ingest --path ./my-project --name my-project --no-gitignore

# Re-index an existing codebase (old data is automatically replaced)
mcp-codebase-ingest --path ~/projects/my-app --name my-app
```

#### What Gets Indexed?

- ✅ TypeScript, JavaScript, Python, Java, C#, Svelte, HTML, CSS, YAML, JSON, Markdown
- ✅ Files in nested subdirectories (recursive scanning)
- ✅ Semantic code chunks (functions, classes, methods, interfaces)
- ✅ Metadata tags (test files, library files)
- ❌ Files larger than 1MB (configurable)
- ❌ Files in `.gitignore` (by default)
- ❌ Lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, etc.)
- ❌ Hidden directories (starting with `.`)
- ❌ Build output (`node_modules`, `dist`, `build`, `target`, etc.)

### MCP Server

The MCP server exposes tools for AI assistants to search and explore codebases.

#### Starting the Server

```bash
mcp-codebase-search
```

The server runs in stdio mode and communicates with MCP clients via standard input/output.

#### Available Tools

##### `list_codebases`

Lists all indexed codebases with metadata including scan age.

**Input:** None

**Output:**
```json
{
  "codebases": [
    {
      "name": "my-project",
      "path": "/path/to/project",
      "chunkCount": 2022,
      "fileCount": 253,
      "lastIngestion": "2026-03-21T06:18:24Z",
      "lastScanAge": 57,
      "languages": ["typescript", "javascript", "markdown"],
      "status": "active"
    }
  ]
}
```

`lastScanAge` is seconds since the last scan. Use it to decide whether to call `update_codebase_scan` before searching.

##### `search_codebases`

Performs semantic search across indexed codebases.

**Input:**
```json
{
  "query": "authentication function",
  "codebaseName": "my-project",
  "language": "typescript",
  "maxResults": 10,
  "includeContent": false,
  "excludeTests": false,
  "excludeLibraries": false
}
```

All fields except `query` are optional. Set `includeContent: true` to include full source code in results.

**Output:**
```json
{
  "results": [
    {
      "filePath": "src/auth/authenticate.ts",
      "startLine": 15,
      "endLine": 45,
      "language": "typescript",
      "chunkType": "function",
      "similarityScore": 0.92
    }
  ],
  "totalResults": 1,
  "queryTime": 45,
  "staleWarning": "Index is 47 minutes old. Call update_codebase_scan('my-project') to refresh."
}
```

`staleWarning` appears when the index is more than 10 minutes old. Content is excluded by default — use `get_chunk_content` or `get_file_content` to read source code.

##### `get_chunk_content`

Retrieves the source code for a specific chunk by file path and line range.

**Input:**
```json
{
  "codebaseName": "my-project",
  "filePath": "src/auth/authenticate.ts",
  "startLine": 15,
  "endLine": 45
}
```

**Output:**
```json
{
  "codebaseName": "my-project",
  "filePath": "src/auth/authenticate.ts",
  "startLine": 15,
  "endLine": 45,
  "language": "typescript",
  "chunkType": "function",
  "content": "export async function authenticate(...) { ... }",
  "lineNumberDrift": 0
}
```

`lineNumberDrift` is non-zero when the chunk was found at a shifted line range — this can occur after incremental rescans where code has moved. A fuzzy ±5 line search is used automatically when an exact match isn't found.

##### `get_file_content`

Retrieves the complete content of an indexed file.

**Input:**
```json
{
  "codebaseName": "my-project",
  "filePath": "src/auth/authenticate.ts"
}
```

**Output:**
```json
{
  "codebaseName": "my-project",
  "filePath": "src/auth/authenticate.ts",
  "language": "typescript",
  "content": "// full file content...",
  "chunkCount": 8,
  "totalLines": 245
}
```

##### `list_files`

Lists all indexed files in a codebase with metadata.

**Input:**
```json
{
  "codebaseName": "my-project"
}
```

**Output:**
```json
{
  "files": [
    {
      "filePath": "src/auth/authenticate.ts",
      "language": "typescript",
      "chunkCount": 8,
      "lastIngestion": "2026-03-21T06:18:24Z",
      "sizeBytes": 4521,
      "isTestFile": false,
      "isLibraryFile": false,
      "fileHash": "a1b2c3d4..."
    }
  ],
  "codebaseName": "my-project",
  "totalFiles": 253
}
```

##### `get_codebase_stats`

Retrieves detailed statistics for a specific codebase.

**Input:**
```json
{
  "name": "my-project"
}
```

**Output:**
```json
{
  "name": "my-project",
  "path": "/path/to/project",
  "chunkCount": 2022,
  "fileCount": 253,
  "lastIngestion": "2026-03-21T06:18:24Z",
  "languages": [
    { "language": "typescript", "fileCount": 200, "chunkCount": 1800 }
  ],
  "chunkTypes": [
    { "type": "function", "count": 800 },
    { "type": "method", "count": 1022 }
  ],
  "sizeBytes": 1250000
}
```

##### `update_codebase_scan`

Incrementally refreshes the index by scanning for changed files. Only re-indexes files whose content has changed — unchanged files are skipped. The search cache is automatically cleared after a successful scan.

**Input:**
```json
{
  "name": "my-project",
  "verbose": false
}
```

Set `verbose: true` to include lists of added, modified, and deleted file paths in the response.

**Output:**
```json
{
  "name": "my-project",
  "filesScanned": 253,
  "filesAdded": 2,
  "filesModified": 5,
  "filesDeleted": 1,
  "filesUnchanged": 245,
  "chunksAdded": 18,
  "chunksDeleted": 12,
  "durationMs": 644,
  "cacheCleared": true,
  "message": "Successfully refreshed codebase 'my-project': 2 added, 5 modified, 1 deleted, 245 unchanged"
}
```

##### `open_codebase_manager`

Opens the web-based Manager UI in the default browser. Automatically launches the manager server if it isn't already running.

**Input:** None

**Output:**
```json
{
  "url": "http://localhost:8008",
  "message": "Opening codebase manager at http://localhost:8008",
  "serverStarted": true
}
```

### Manager UI

The Manager UI provides a browser-based interface for managing indexed codebases.

#### Starting the Manager

```bash
mcp-codebase-manager
```

Opens `http://localhost:8008` automatically.

#### Features

**Search Tab:**
- Semantic search across all indexed codebases
- Filter by codebase and max results
- Exclude test files and library files
- Collapsible results with colour-coded confidence scores:
  - 🟢 Green (0.80–1.00): Excellent match
  - 🟡 Yellow (0.60–0.79): Good match
  - 🔵 Blue (0.00–0.59): Lower match

**Manage Tab:**
- View all indexed codebases with chunk counts and last scan date
- Add new codebases with folder browser and real-time progress tracking
- Rescan codebases for incremental updates
- View per-file details and delete individual files from the index
- Rename and remove codebases
- Light/dark theme toggle

**Manager Controls:**
- Quit button gracefully stops the server and closes the browser tab


## Configuration

Configuration is stored at `~/.codebase-memory/config.json`.

### Configuration File Example

```json
{
  "lancedb": {
    "persistPath": "~/.codebase-memory/lancedb"
  },
  "embedding": {
    "modelName": "Xenova/all-MiniLM-L6-v2",
    "cachePath": "~/.codebase-memory/models"
  },
  "server": {
    "port": 8008,
    "host": "localhost",
    "sessionSecret": "change-me-in-production"
  },
  "mcp": {
    "transport": "stdio"
  },
  "ingestion": {
    "batchSize": 100,
    "maxFileSize": 1048576,
    "maxChunkTokens": 512,
    "chunkOverlapTokens": 50,
    "storeFullFiles": true
  },
  "search": {
    "defaultMaxResults": 50,
    "cacheTimeoutSeconds": 60
  },
  "logging": {
    "level": "info"
  },
  "schemaVersion": "1.0.0"
}
```

### Configuration Options

| Section | Option | Description | Default |
|---------|--------|-------------|---------|
| `lancedb` | `persistPath` | LanceDB storage directory | `~/.codebase-memory/lancedb` |
| `embedding` | `modelName` | Hugging Face model | `Xenova/all-MiniLM-L6-v2` |
| `embedding` | `cachePath` | Model cache directory | `~/.codebase-memory/models` |
| `server` | `port` | Manager UI port | `8008` |
| `server` | `host` | Manager UI host | `localhost` |
| `server` | `sessionSecret` | Session cookie secret | Auto-generated |
| `ingestion` | `batchSize` | Chunks per embedding batch | `100` |
| `ingestion` | `maxFileSize` | Maximum file size (bytes) | `1048576` |
| `ingestion` | `maxChunkTokens` | Maximum tokens per chunk | `512` |
| `ingestion` | `chunkOverlapTokens` | Token overlap between chunks | `50` |
| `ingestion` | `storeFullFiles` | Store full file content for `get_file_content` | `true` |
| `search` | `defaultMaxResults` | Default result limit | `50` |
| `search` | `cacheTimeoutSeconds` | Search cache TTL (auto-cleared on rescan) | `60` |
| `logging` | `level` | Log verbosity | `info` |


## MCP Client Configuration

### Claude Desktop

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "codebase-search": {
      "command": "mcp-codebase-search",
      "args": []
    }
  }
}
```

### Other MCP Clients

```json
{
  "mcpServers": {
    "codebase-search": {
      "command": "mcp-codebase-search",
      "args": [],
      "env": {
        "CONFIG_PATH": "~/.codebase-memory/config.json",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Verifying Configuration

1. Restart the client application
2. Check that `codebase-search` appears in the MCP server list
3. Call `list_codebases` to verify connectivity


## Supported Languages

| Language | Extensions | Chunk Types |
|----------|-----------|-------------|
| **TypeScript** | `.ts`, `.tsx` | function, class, method, interface |
| **JavaScript** | `.js`, `.jsx` | function, class, method |
| **Python** | `.py` | function, class, method |
| **Java** | `.java` | class, method, field, interface |
| **C#** | `.cs` | class, method, property, interface |
| **Svelte** | `.svelte` | component |
| **HTML** | `.html` | file |
| **CSS / SCSS** | `.css`, `.scss` | file |
| **JSON** | `.json` | file |
| **YAML** | `.yaml`, `.yml` | file |
| **Markdown** | `.md` | sections |

Files that produce no AST chunks (e.g. configuration-only or import-only files) are indexed as a single file-level chunk so they remain searchable.


## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Entry Points                             │
├──────────────┬──────────────────┬──────────────────────────┤
│  MCP Server  │  Ingestion CLI   │     Manager UI           │
│  (stdio)     │  (command-line)  │  (Fastify + Handlebars)  │
└──────┬───────┴────────┬─────────┴──────────┬───────────────┘
       │                │                    │
┌──────▼────────────────▼────────────────────▼───────────────┐
│                   Core Services                             │
├─────────────┬──────────────┬──────────────┬────────────────┤
│  Codebase   │    Search    │  Ingestion   │   Embedding    │
│  Service    │   Service    │   Service    │    Service     │
└──────┬──────┴──────┬───────┴──────┬───────┴────────┬───────┘
       │             │              │                │
┌──────▼─────────────▼──────────────▼────────────────▼───────┐
│                   Storage & Parsing                         │
├──────────────┬──────────────────┬─────────────────────────┤
│   LanceDB    │  Tree-sitter     │  Hugging Face           │
│ (Vector DB)  │  (Code Parsing)  │  (Embeddings, local)    │
└──────────────┴──────────────────┴─────────────────────────┘
```

### Data Flow

#### Ingestion

```
Source Code → File Scanner → Tree-sitter Parser → Semantic Chunks
                                                         ↓
                                                  Token Counter
                                                         ↓
                                              Split Oversized Chunks
                                                         ↓
                                                 File Classifier
                                                         ↓
LanceDB ← Embeddings ← Embedding Service ← Tagged Chunks
```

**Chunking Strategy:** Tree-sitter extracts semantic units (functions, classes, methods). Units exceeding 512 tokens are split on line boundaries with 50-token overlap. Files producing zero AST chunks get a single file-level chunk to ensure everything remains searchable.

#### Search

```
Query → Embedding Service → Vector
                              ↓
                         LanceDB Search (top N×10 candidates)
                              ↓
                         Name/Symbol Boost (re-rank)
                              ↓
                         Apply Filters → Trim to N → Response
```

The search cache is automatically cleared after every `update_codebase_scan`.

### Storage Schema

LanceDB table naming: `codebase_{name}_{schemaVersion}` (e.g. `codebase_my-project_1_0_0`)

Row structure:
```json
{
  "id": "my-project_2026-03-21T06:18:24Z_0",
  "vector": [0.1, 0.2, "..."],
  "content": "export async function authenticate(...) { ... }",
  "filePath": "src/auth.ts",
  "startLine": 15,
  "endLine": 45,
  "language": "typescript",
  "chunkType": "function",
  "isTestFile": false,
  "isLibraryFile": false,
  "fileHash": "a1b2c3d4...",
  "fullFileContent": "// complete file content",
  "ingestionTimestamp": "2026-03-21T06:18:24Z",
  "_codebaseName": "my-project",
  "_path": "/path/to/project",
  "_lastIngestion": "2026-03-21T06:18:24Z"
}
```


## Troubleshooting

### Common Issues

#### "Command not found: mcp-codebase-search"

```bash
npm install -g @teknologika/mcp-codebase-search
# or use npx
npx mcp-codebase-search
```

#### "Failed to initialize LanceDB"

```bash
# Check permissions
ls -la ~/.codebase-memory/lancedb

# Reset LanceDB (WARNING: deletes all indexed data)
rm -rf ~/.codebase-memory/lancedb

# Re-ingest
mcp-codebase-ingest --path ./my-project --name my-project
```

#### "Embedding model download failed"

```bash
# Check available disk space (~500MB needed)
df -h ~/.codebase-memory

# Clear model cache and retry
rm -rf ~/.codebase-memory/models
mcp-codebase-ingest --path ./my-project --name my-project
```

#### "Search returns no results"

Semantic search works best with descriptive phrases rather than exact identifiers. Try broader queries:

```
# Instead of: "validateEmailAddress"
# Try: "email validation function"
```

For exact identifier lookup, use `get_file_content` on the most likely files after a broad search.

#### "Manager UI won't open / port in use"

```bash
# Check what's using port 8008
lsof -i :8008

# Use a different port in config
# ~/.codebase-memory/config.json
{ "server": { "port": 8009 } }
```

#### Index is stale after code changes

Call `update_codebase_scan` after significant edits. File hashing means only modified files are re-embedded, so rescans are fast even on large codebases.

### Performance Tips

- **Increase batch size** for faster initial ingestion (requires more RAM):
  ```json
  { "ingestion": { "batchSize": 200 } }
  ```
- **Use SSD storage** for the LanceDB persistence directory
- **Exclude unnecessary files** via `.gitignore`
- **Rescan regularly** — call `update_codebase_scan` after significant changes


## Development

### Setup

```bash
git clone https://github.com/teknologika/mcp-codebase-search.git
cd mcp-codebase-search
npm install
npm run build
```

### Scripts

```bash
npm run build          # Compile TypeScript + copy UI assets
npm test               # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run lint           # ESLint
npm run lint:fix       # Auto-fix lint issues
npm run clean          # Remove build artifacts
npm run typecheck      # Type check without building
```

### Project Structure

```
src/
├── bin/                    # Entry points (mcp-server, ingest, manager)
├── domains/                # Domain business logic
│   ├── codebase/           # Codebase CRUD and file operations
│   ├── search/             # Semantic search with caching
│   ├── ingestion/          # File scanning and indexing pipeline
│   ├── embedding/          # Local embedding generation
│   └── parsing/            # Tree-sitter + plaintext fallback parsers
├── infrastructure/         # External integrations
│   ├── lancedb/            # LanceDB client wrapper
│   ├── mcp/                # MCP server and tool schemas
│   └── fastify/            # Manager UI server and routes
├── shared/                 # Shared utilities
│   ├── config/             # Configuration management
│   ├── logging/            # Structured logging (Pino)
│   ├── types/              # Shared TypeScript types
│   └── utils/              # File hashing, token counting, classification
└── ui/                     # Web interface
    └── manager/
        ├── templates/      # Handlebars templates
        └── static/         # CSS and JavaScript
```


## Contributing

### Reporting Issues

1. Search existing issues to avoid duplicates
2. Include: Node.js version, OS, reproduction steps, error messages

### Submitting Pull Requests

1. Fork and create a feature branch: `git checkout -b feature/my-feature`
2. Make changes, add tests, update docs
3. Run `npm test` and `npm run lint`
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, etc.
5. Open a pull request

### Areas for Contribution

- 🌐 **Language support** — additional Tree-sitter grammars (Rust, Go, Ruby)
- 🔍 **Search improvements** — FTS/keyword search mode for exact identifier lookup
- ⚡ **Performance** — search and ingestion optimisations
- 🎨 **UI improvements** — Manager UI enhancements
- 🐛 **Bug fixes** — see open issues


## Security

- **No external API calls** — all processing is local
- **No telemetry** — no usage data collected or transmitted
- **Localhost only** — Manager UI binds to localhost by default
- **Path validation** — file paths validated to prevent directory traversal
- **Input validation** — all MCP tool inputs validated with AJV schemas

**Recommendations:**
1. Do not expose the Manager UI to public networks
2. Keep the package updated: `npm update -g @teknologika/mcp-codebase-search`
3. Run security audits: `npm audit`


## License

MIT License — see [LICENSE](LICENSE) for details.

## Author

**Teknologika**

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) — MCP specification
- [LanceDB](https://lancedb.com/) — Vector database
- [Tree-sitter](https://tree-sitter.github.io/) — Code parsing
- [Hugging Face](https://huggingface.co/) — Embedding models
- [Fastify](https://www.fastify.io/) — Web framework

---

**Questions or Issues?** Open an issue on [GitHub](https://github.com/teknologika/mcp-codebase-search/issues)
