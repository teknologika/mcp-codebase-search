# @teknologika/mcp-codebase-search

> A local-first semantic search system for codebases using the Model Context Protocol (MCP)

<!-- Test comment for rescan functionality - 2026-02-13 -->

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D23.0.0-brightgreen)](https://nodejs.org/)
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

The Codebase Memory MCP Server enables LLM coding assistants to reliably discover existing code in a codebase, preventing duplicate implementations and wrong-file edits. It uses local embeddings, Tree-sitter-aware chunking, and LanceDB for vector storage, ensuring all operations run locally without cloud dependencies.

### Why Use This?

- **Prevent Duplicate Code**: AI assistants can find existing implementations before creating new ones
- **Accurate Code Navigation**: Semantic search understands code meaning, not just keywords
- **Privacy-First**: All processing happens locally—your code never leaves your machine
- **Fast & Efficient**: Optimized for quick search responses with intelligent caching
- **Multi-Language**: Support for C#, Java, JavaScript, TypeScript, and Python
- **Smart Filtering**: Exclude test files and library code from search results

## Features

- 🔒 **Local-First**: All operations run locally without external API calls
- 🔍 **Semantic Search**: Find code by meaning, not just keywords
- 🌳 **Tree-sitter Parsing**: AST-aware code chunking for meaningful results
- 🤖 **MCP Integration**: Seamless integration with MCP-compatible AI assistants (Claude Desktop, etc.)
- 🌐 **Multi-Language Support**: C#, Java, JavaScript, TypeScript, Python
- 🖥️ **Web Management UI**: Manage indexed codebases through a web interface
- ⚡ **Performance Optimized**: Sub-500ms search responses with intelligent caching
- 🎯 **Smart Filtering**: Exclude test files and library code from results
- 📊 **Detailed Statistics**: Track chunk counts, file counts, and language distribution
- 🔄 **Gitignore Support**: Respects .gitignore patterns during ingestion


## Installation

### Global Installation (Recommended)

```bash
npm install -g @teknologika/mcp-codebase-search
```

This makes three commands available globally:
- `mcp-codebase-search` - MCP server for AI assistants
- `mcp-codebase-ingest` - CLI for indexing codebases
- `mcp-codebase-manager` - Web UI for management

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

- **Node.js**: 23.0.0 or higher
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

Scanning directory: [████████████████████] 100% (1,234/1,234)
Parsing files: [████████████████████] 100% (1,100/1,100)
Generating embeddings: [████████████████████] 100% (5,678/5,678)
Storing chunks: [████████████████████] 100% (5,678/5,678)

✓ Ingestion completed successfully!

Statistics:
  Total files scanned: 1,234
  Supported files: 1,100
  Unsupported files: 134
  Chunks created: 5,678
  Duration: 45.2s

Languages detected:
  typescript: 3,200 chunks (800 files)
  python: 1,500 chunks (200 files)
  java: 978 chunks (100 files)
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

### 3. Setp your Agents.md

```md
# AGENTS.md — Codebase Dedupe Protocol

## Goal
Prevent duplicate implementations and “wrong file” edits by making **codebase-search** the *only valid source* for claims about what already exists in this repo during this session.

This project has a strict rule: **you must not create new code, new files, or new implementations unless you have first searched the codebase using the MCP tool and compared against the results.**

## Tools you MUST use for codebase discovery
Use **codebase-search** tools for discovery and evidence:

- `list_codebases`
- `search_codebases`
- `get_chunk_content`
- `get_codebase_stats`

After updates run `update_codebase_scan` to refresh the codebase search results.

These are the only approved discovery tools for “what exists already.” 

## Hard rule: No creation without a Dedupe Ticket
Before you do *any* of the following, you must produce a Dedupe Ticket and run the searches it specifies:

Creation triggers include: adding a new file, adding a new module/class/function, introducing a new utility/helper, duplicating a configuration pattern, or proposing a new “approach/framework” that sounds like it could already exist.

A **Dedupe Ticket** is a short structured note you write in your response (keep it compact):

**Dedupe Ticket**
- Intent signature: `<one sentence describing exactly what you are about to add/change>`
- Queries: `<2–4 searches you will run in search_codebases>`
- Top matches: `<up to 5 result identifiers or file paths returned by the tool>`
- Decision: `reuse | extend | new`
- Rationale: `<why reuse/extend is sufficient, or why new is justified>`

You must actually call `search_codebases` before finalizing the ticket. Do not guess.

## Execution protocol
When asked to implement or change code:

1) If the request implies any creation trigger, begin by calling `search_codebases` (and `list_codebases` if you have not yet selected the codebase in this session).
2) Review results and decide `reuse | extend | new`.
3) Only then propose edits, and prefer extending existing implementations over creating new ones.
4) After making significant edits run update_codebase_scan to re-index the codebase

## What you may not do
You may not claim “there is no existing implementation” or “this doesn’t exist” unless you have run `search_codebases` in this session and the results support that claim. “I didn’t see it” is not acceptable without a tool call.

You may not create “parallel” implementations alongside existing ones unless the Dedupe Ticket explicitly justifies why reuse/extension is not viable.

## Graceful degradation
If the MCP server is unavailable or returning errors:
State **DEGRADED MODE** at the top of your reply and stop before making changes. Ask for the MCP server to be enabled/fixed, or ask for explicit user approval to proceed best-effort without search. Do not proceed silently.

## Tool intent alignment
When you need to know what exists, where it is, or how similar code is structured, you must treat `search_codebases` as authoritative. Do not infer from local context alone.


### 4. Start Using in Your AI Assistant

Once configured, your AI assistant can use these tools:

- **list_codebases**: See all indexed codebases
- **search_codebases**: Search for code semantically
- **get_codebase_stats**: View detailed statistics
- **open_codebase_manager**: Launch and open the Manager UI in your browser

### 5. (Optional) Explore the Manager UI

```bash
mcp-codebase-manager
```

Opens `http://localhost:8008` in your default browser with a visual interface for:
- Searching codebases with filters
- Managing indexed codebases
- Viewing statistics and metadata
- Adding new codebases with real-time progress


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

**Index a local project:**
```bash
mcp-codebase-ingest --path ~/projects/my-app --name my-app
```

**Index with custom config:**
```bash
mcp-codebase-ingest --path ./backend --name backend-api --config ./custom-config.json
```

**Index without gitignore filtering:**
```bash
mcp-codebase-ingest --path ./my-project --name my-project --no-gitignore
```

**Re-index an existing codebase:**
```bash
# Simply run the same command again - old data is automatically replaced
mcp-codebase-ingest --path ~/projects/my-app --name my-app
```

#### What Gets Indexed?

- ✅ All files with supported extensions (`.cs`, `.java`, `.js`, `.jsx`, `.ts`, `.tsx`, `.py`)
- ✅ Files in nested subdirectories (recursive scanning)
- ✅ Semantic code chunks (functions, classes, methods, interfaces)
- ✅ Metadata tags (test files, library files)
- ❌ Files larger than 1MB (configurable via `maxFileSize`)
- ❌ Files in `.gitignore` (by default, use `--no-gitignore` to include)
- ❌ Binary files and unsupported formats
- ❌ Hidden directories (starting with `.`)

### MCP Server

The MCP server exposes tools for AI assistants to search and explore codebases.

#### Starting the Server

```bash
mcp-codebase-search
```

The server runs in stdio mode and communicates with MCP clients via standard input/output.

#### Available Tools

##### 1. `list_codebases`

Lists all indexed codebases with metadata.

**Input:** None

**Output:**
```json
{
  "codebases": [
    {
      "name": "my-project",
      "path": "/path/to/project",
      "chunkCount": 5678,
      "fileCount": 1100,
      "lastIngestion": "2024-01-15T10:30:00Z",
      "languages": ["typescript", "python", "java"]
    }
  ]
}
```

##### 2. `search_codebases`

Performs semantic search across indexed codebases.

**Input:**
```json
{
  "query": "authentication function",
  "codebaseName": "my-project",  // Optional
  "language": "typescript",       // Optional
  "maxResults": 25                // Optional (default: 50)
}
```

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
      "content": "export async function authenticate(credentials: Credentials) { ... }",
      "similarityScore": 0.92,
      "codebaseName": "my-project"
    }
  ],
  "totalResults": 1,
  "queryTime": 45
}
```

##### 3. `get_codebase_stats`

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
  "chunkCount": 5678,
  "fileCount": 1100,
  "lastIngestion": "2024-01-15T10:30:00Z",
  "languages": [
    { "language": "typescript", "fileCount": 800, "chunkCount": 3200 },
    { "language": "python", "fileCount": 200, "chunkCount": 1500 }
  ],
  "chunkTypes": [
    { "type": "function", "count": 2500 },
    { "type": "class", "count": 1200 },
    { "type": "method", "count": 1978 }
  ],
  "sizeBytes": 2500000
}
```

##### 4. `open_codebase_manager`

Opens the web-based Manager UI in the default browser. Automatically launches the server if it's not already running.

**Input:** None

**Output:**
```json
{
  "success": true,
  "url": "http://localhost:8008",
  "serverStarted": true,
  "message": "Manager UI opened in browser. Server was started."
}
```

**Note:** The tool checks if the Manager server is running on the configured port. If not, it launches the server in the background before opening the browser.

### Manager UI

The Manager UI provides a web-based interface for managing indexed codebases.

#### Starting the Manager

```bash
mcp-codebase-manager
```

This will:
1. Start a Fastify server on port 8008 (configurable)
2. Automatically open `http://localhost:8008` in your default browser
3. Display all indexed codebases with statistics

#### Features

**Search Tab:**
- Semantic search across all codebases
- Filter by codebase and max results
- Exclude test files checkbox
- Exclude library files checkbox
- Collapsible results with color-coded confidence scores:
  - 🟢 Green (0.80-1.00): Excellent match
  - 🟡 Yellow (0.60-0.79): Good match
  - 🔵 Blue (0.00-0.59): Lower match

**Manage Codebases Tab:**
- View all indexed codebases
- See chunk counts, file counts, and last indexed date
- Add new codebases with real-time progress tracking
- Rename codebases
- Remove codebases
- Gitignore filtering checkbox (checked by default)

**Manager Controls:**
- Quit Manager button with confirmation dialog (stops server and closes browser tab)


## Configuration

The system can be configured using a JSON configuration file. The default location is `~/.codebase-memory/config.json`.

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
    "chunkOverlapTokens": 50
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

#### LanceDB Settings

| Option | Description | Default |
|--------|-------------|---------|
| `persistPath` | Directory for LanceDB storage | `~/.codebase-memory/lancedb` |

#### Embedding Settings

| Option | Description | Default |
|--------|-------------|---------|
| `modelName` | Hugging Face model for embeddings | `Xenova/all-MiniLM-L6-v2` |
| `cachePath` | Directory for model cache | `~/.codebase-memory/models` |

#### Server Settings

| Option | Description | Default |
|--------|-------------|---------|
| `port` | Port for Manager UI server | `8008` |
| `host` | Host for Manager UI server | `localhost` |
| `sessionSecret` | Secret for session cookies | Auto-generated |

#### Ingestion Settings

| Option | Description | Default |
|--------|-------------|---------|
| `batchSize` | Chunks per batch during ingestion | `100` |
| `maxFileSize` | Maximum file size in bytes | `1048576` (1MB) |
| `maxChunkTokens` | Maximum tokens per chunk (optimized for embedding model) | `512` |
| `chunkOverlapTokens` | Token overlap between split chunks for context preservation | `50` |

**Note:** The `maxChunkTokens` setting is optimized for the Xenova/all-MiniLM-L6-v2 model. Adjust based on your embedding model's optimal input size.

#### Search Settings

| Option | Description | Default |
|--------|-------------|---------|
| `defaultMaxResults` | Default maximum search results | `50` |
| `cacheTimeoutSeconds` | Search result cache timeout | `60` |

#### Logging Settings

| Option | Description | Default | Options |
|--------|-------------|---------|---------|
| `level` | Log level | `info` | `debug`, `info`, `warn`, `error` |

### Custom Configuration

To use a custom configuration file:

```bash
# For ingestion
mcp-codebase-ingest --config ./my-config.json --path ./code --name my-code

# For MCP server (via environment variable)
CONFIG_PATH=./my-config.json mcp-codebase-search
```

## MCP Client Configuration

### Using Codex CLI (Recommended)

The easiest way to configure this MCP server is using the [Codex CLI](https://github.com/teknologika/codex):

```bash
codex mcp add codebase-search -- mcp-codebase-search
```

With custom environment variables:

```bash
codex mcp add codebase-search \
  --env CONFIG_PATH=~/.codebase-memory/config.json \
  --env LOG_LEVEL=info \
  -- mcp-codebase-search
```

The `codex mcp add` command automatically:
- Detects your MCP client (Claude Desktop, Cline, etc.)
- Updates the appropriate configuration file
- Validates the configuration
- Restarts the MCP client if needed

### Manual Configuration

#### Claude Desktop

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Linux:** `~/.config/Claude/claude_desktop_config.json`

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

#### Other MCP Clients

For other MCP-compatible clients, use the stdio transport:

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

After configuring your MCP client:

1. Restart the client application
2. Check that the `codebase-search` server appears in the MCP server list
3. Try using the `list_codebases` tool to verify connectivity

## Supported Languages

The system uses Tree-sitter for AST-aware code parsing. Currently supported languages:

| Language | Extensions | Chunk Types |
|----------|-----------|-------------|
| **C#** | `.cs` | class, method, property, interface |
| **Java** | `.java` | class, method, field, interface |
| **JavaScript** | `.js`, `.jsx` | function, class, method |
| **TypeScript** | `.ts`, `.tsx` | function, class, method, interface |
| **Python** | `.py` | function, class, method |

### What Gets Extracted?

For each supported language, the system extracts:

- **Functions**: Top-level and nested functions
- **Classes**: Class declarations with their context
- **Methods**: Class methods and instance methods
- **Interfaces**: Interface definitions (TypeScript, C#, Java)
- **Properties**: Class properties (C#)
- **Fields**: Class fields (Java)

### File Classification

The system automatically classifies files during ingestion:

**Test Files** (tagged with `isTestFile: true`):
- Files ending in `.test.ts`, `.spec.ts`, `_test.py`, etc.
- Files in `__tests__/`, `test/`, `tests/`, `spec/` directories

**Library Files** (tagged with `isLibraryFile: true`):
- Files in `node_modules/`, `vendor/`, `dist/`, `build/`, `venv/`, etc.

These tags enable filtering in search results.


## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Entry Points                             │
├──────────────┬──────────────────┬──────────────────────────┤
│  MCP Server  │  Ingestion CLI   │     Manager UI           │
│  (stdio)     │  (command-line)  │  (web interface)         │
└──────┬───────┴────────┬─────────┴──────────┬───────────────┘
       │                │                    │
       │                │                    │
┌──────▼────────────────▼────────────────────▼───────────────┐
│                   Core Services                             │
├─────────────┬──────────────┬──────────────┬────────────────┤
│  Codebase   │    Search    │  Ingestion   │   Embedding    │
│  Service    │   Service    │   Service    │    Service     │
└──────┬──────┴──────┬───────┴──────┬───────┴────────┬───────┘
       │             │              │                │
       │             │              │                │
┌──────▼─────────────▼──────────────▼────────────────▼───────┐
│                   Storage & External                        │
├──────────────┬──────────────────┬─────────────────────────┤
│   LanceDB    │  Tree-sitter     │  Hugging Face           │
│ (Vector DB)  │  (Code Parsing)  │  (Embeddings)           │
└──────────────┴──────────────────┴─────────────────────────┘
```

### Component Responsibilities

**MCP Server** (`mcp-codebase-search`)
- Exposes tools via Model Context Protocol
- Validates inputs and outputs
- Handles stdio communication

**Ingestion CLI** (`mcp-codebase-ingest`)
- Scans directories recursively
- Respects .gitignore patterns
- Parses code with Tree-sitter
- Classifies test and library files
- Generates embeddings
- Stores chunks in LanceDB

**Manager UI** (`mcp-codebase-manager`)
- Fastify web server with SSR
- Real-time ingestion progress via SSE
- Search interface with filters
- Codebase management

**Core Services**
- **Codebase Service**: CRUD operations for codebases
- **Search Service**: Semantic search with filtering and caching
- **Ingestion Service**: Orchestrates indexing pipeline
- **Embedding Service**: Generates vector embeddings locally

### Data Flow

#### Ingestion Flow

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

**Chunking Strategy:**
The system uses a hybrid approach optimized for the Xenova/all-MiniLM-L6-v2 model:

1. **AST-Based Extraction**: Tree-sitter extracts semantic units (functions, classes, methods)
2. **Token-Aware Splitting**: Large chunks exceeding 512 tokens are intelligently split:
   - Splits on line boundaries (preferred)
   - Falls back to sentence boundaries
   - Maintains 50-token overlap for context
   - Preserves metadata (file path, language, line numbers)

This ensures optimal embedding quality while maintaining semantic coherence.

#### Search Flow

```
Query → Embedding Service → Vector
                              ↓
                         LanceDB Search
                              ↓
                         Apply Filters (tests, libraries)
                              ↓
                         Ranked Results → Format → Response
```

### Storage Schema

**LanceDB Tables:**
- Table naming: `codebase_{name}_{schemaVersion}`
- Example: `codebase_my-project_1_0_0`

**Row Structure:**
```json
{
  "id": "my-project_2024-01-15T10:30:00Z_0",
  "vector": [0.1, 0.2, ...],
  "content": "export async function authenticate(...) { ... }",
  "filePath": "src/auth.ts",
  "startLine": 15,
  "endLine": 45,
  "language": "typescript",
  "chunkType": "function",
  "isTestFile": false,
  "isLibraryFile": false,
  "ingestionTimestamp": "2024-01-15T10:30:00Z",
  "_codebaseName": "my-project",
  "_path": "/path/to/project",
  "_lastIngestion": "2024-01-15T10:30:00Z"
}
```

## Troubleshooting

### Common Issues

#### 1. "Command not found: mcp-codebase-search"

**Problem:** The package is not installed globally or not in PATH.

**Solution:**
```bash
# Reinstall globally
npm install -g @teknologika/mcp-codebase-search

# Or use npx
npx mcp-codebase-search
```

#### 2. "Failed to initialize LanceDB"

**Problem:** LanceDB persistence directory is not writable or corrupted.

**Solution:**
```bash
# Check permissions
ls -la ~/.codebase-memory/lancedb

# Reset LanceDB (WARNING: deletes all data)
rm -rf ~/.codebase-memory/lancedb

# Re-ingest codebases
mcp-codebase-ingest --path ./my-project --name my-project
```

#### 3. "Embedding model download failed"

**Problem:** Network issues or insufficient disk space.

**Solution:**
```bash
# Check disk space
df -h ~/.codebase-memory

# Clear model cache and retry
rm -rf ~/.codebase-memory/models

# Run ingestion again (will re-download)
mcp-codebase-ingest --path ./my-project --name my-project
```

#### 4. "Search returns no results"

**Problem:** Codebase not indexed or query too specific.

**Solution:**
```bash
# Verify codebase is indexed
mcp-codebase-manager
# Check the UI for your codebase

# Try broader queries
# Instead of: "validateEmailAddress"
# Try: "email validation function"
```

#### 5. "Manager UI won't open"

**Problem:** Port 8008 is already in use.

**Solution:**
```bash
# Check what's using port 8008
lsof -i :8008

# Kill the process or use a different port
# Edit ~/.codebase-memory/config.json
{
  "server": {
    "port": 8009
  }
}
```

#### 6. "MCP client can't connect to server"

**Problem:** Configuration issue or server not starting.

**Solution:**
```bash
# Test server manually
mcp-codebase-search

# Verify configuration path
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Check logs for errors
```

### Performance Tips

1. **Increase batch size** for faster ingestion (if you have sufficient RAM):
   ```json
   {
     "ingestion": {
       "batchSize": 200
     }
   }
   ```

2. **Adjust cache timeout** for frequently repeated queries:
   ```json
   {
     "search": {
       "cacheTimeoutSeconds": 120
     }
   }
   ```

3. **Use SSD storage** for LanceDB persistence directory

4. **Exclude unnecessary files** using .gitignore patterns


## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/teknologika/mcp-codebase-search.git
cd mcp-codebase-search

# Install dependencies
npm install

# Build the project
npm run build
```

### Scripts

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Security audit
npm run security

# Clean build artifacts
npm run clean

# Type check without building
npm run typecheck
```

### Project Structure

```
src/
├── bin/                    # Entry points (mcp-server, ingest, manager)
├── domains/                # Domain-specific business logic
│   ├── codebase/          # Codebase CRUD operations
│   ├── search/            # Semantic search functionality
│   ├── ingestion/         # File scanning and indexing
│   ├── embedding/         # Embedding generation
│   └── parsing/           # Tree-sitter code parsing
├── infrastructure/         # External integrations
│   ├── lancedb/           # LanceDB client wrapper
│   ├── mcp/               # MCP server implementation
│   └── fastify/           # Fastify server and routes
├── shared/                 # Shared utilities
│   ├── config/            # Configuration management
│   ├── logging/           # Structured logging with Pino
│   ├── types/             # Shared TypeScript types
│   └── utils/             # Utility functions
└── ui/                     # Web interface
    └── manager/           # Single-page management UI
```

### Testing

The project uses **Vitest** for testing with both unit tests and property-based tests.

**Test Coverage Requirements:**
- Minimum 80% statement coverage
- Minimum 80% branch coverage
- 90%+ coverage for critical paths

**Run specific tests:**
```bash
# Test a specific file
npm test -- src/domains/search/search.service.test.ts

# Test with coverage
npm run test:coverage

# Watch mode for TDD
npm run test:watch
```

### Building and Packaging

```bash
# Clean and build
npm run clean && npm run build

# Create npm package
npm pack

# Install package globally for testing
npm install -g ./teknologika-mcp-codebase-search-0.1.0.tgz

# Test commands
mcp-codebase-search --version
mcp-codebase-ingest --help
mcp-codebase-manager
```

## Contributing

We welcome contributions! Here's how you can help:

### Reporting Issues

1. **Search existing issues** to avoid duplicates
2. **Provide details**:
   - Node.js version
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior
   - Error messages and logs

### Submitting Pull Requests

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes**:
   - Follow existing code style
   - Add tests for new functionality
   - Update documentation
4. **Run tests**: `npm test`
5. **Run linter**: `npm run lint`
6. **Commit with clear messages**: `git commit -m "feat: add new feature"`
7. **Push to your fork**: `git push origin feature/my-feature`
8. **Open a pull request**

### Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Follow existing patterns
- **Naming**: Use descriptive names (camelCase for variables, PascalCase for classes)
- **Comments**: Document complex logic and public APIs
- **Tests**: Write both unit tests and property-based tests

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test changes
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `chore:` Build/tooling changes

### Areas for Contribution

- 🌐 **Language support**: Add more Tree-sitter grammars
- ⚡ **Performance**: Optimize search and ingestion
- 🎨 **UI improvements**: Enhance the Manager UI
- 📚 **Documentation**: Improve guides and examples
- 🧪 **Testing**: Increase test coverage
- 🐛 **Bug fixes**: Fix reported issues
- 🔍 **Search improvements**: Better ranking algorithms
- 🏷️ **File classification**: More patterns for test/library detection

## Security

### Local-First Architecture

- ✅ **No external API calls**: All processing happens locally
- ✅ **No telemetry**: No usage data is collected or transmitted
- ✅ **No cloud dependencies**: Embeddings generated locally with Hugging Face Transformers

### File System Security

- **Path validation**: All file paths are validated to prevent directory traversal
- **Permission checks**: Respects file system permissions
- **Gitignore support**: Automatically skips files in `.gitignore`

### Input Validation

- **Schema validation**: All inputs validated with Zod schemas
- **Type checking**: Strict TypeScript types throughout
- **Sanitization**: User inputs sanitized before processing

### Resource Limits

- **Max file size**: 1MB default (configurable)
- **Max results**: 200 maximum per search
- **Batch size limits**: Prevents memory exhaustion

### Network Security

- **Localhost only**: Manager UI binds to localhost by default
- **Security headers**: Helmet.js for HTTP security headers
- **Session management**: Secure session cookies

### Recommendations

1. **Do not expose Manager UI to public networks**
2. **Keep the package updated** for security patches
3. **Run regular security audits**: `npm audit`
4. **Use strong file system permissions**
5. **Back up data regularly** before major updates

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

**Teknologika**

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification
- [LanceDB](https://lancedb.com/) - Vector database
- [Tree-sitter](https://tree-sitter.github.io/) - Code parsing
- [Hugging Face](https://huggingface.co/) - Embedding models
- [Fastify](https://www.fastify.io/) - Web framework

---

**Questions or Issues?** Open an issue on [GitHub](https://github.com/teknologika/mcp-codebase-search/issues)

**Need Help?** Check the [Troubleshooting](#troubleshooting) section above
