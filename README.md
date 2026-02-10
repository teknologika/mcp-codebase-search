# @teknologika/mcp-codebase-search

A local-first semantic search system for codebases using the Model Context Protocol (MCP).

## Overview

The Codebase Memory MCP Server enables LLM coding assistants to reliably discover existing code in a codebase, preventing duplicate implementations and wrong-file edits. It uses local embeddings, Tree-sitter-aware chunking, and ChromaDB for vector storage, ensuring all operations run locally without cloud dependencies.

## Features

- **Local-First**: All operations run locally without external API calls
- **Semantic Search**: Find code by meaning, not just keywords
- **Tree-sitter Parsing**: AST-aware code chunking for meaningful results
- **MCP Integration**: Seamless integration with MCP-compatible AI assistants
- **Multi-Language Support**: C#, Java (JDK22+), JavaScript, TypeScript, Python
- **Web Management UI**: Manage indexed codebases through a web interface

## Installation

```bash
npm install -g @teknologika/mcp-codebase-search
```

## Requirements

- Node.js 23.0.0 or higher
- npm 10.0.0 or higher

## Quick Start

### 1. Index a Codebase

```bash
ingest --path ./my-project --name my-project
```

### 2. Configure MCP Client

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "codebase-search": {
      "command": "mcp-server",
      "args": [],
      "env": {
        "CONFIG_PATH": "~/.codebase-memory/config.json"
      }
    }
  }
}
```

### 3. Start Manager UI (Optional)

```bash
manager
```

Opens a web interface at `http://localhost:8008` for managing codebases.

## Usage

### Ingestion CLI

Index a codebase for semantic search:

```bash
ingest --path <directory> --name <codebase-name> [--config <config-file>]
```

**Options:**
- `--path`: Path to codebase directory (required)
- `--name`: Unique name for the codebase (required)
- `--config`: Path to configuration file (optional)

### MCP Server

The MCP server provides four tools for AI assistants:

1. **list_codebases**: List all indexed codebases
2. **search_codebases**: Search for code semantically
3. **get_codebase_stats**: Get detailed statistics for a codebase
4. **open_codebase_manager**: Open the web management UI

### Manager UI

Start the web interface:

```bash
manager
```

Features:
- View all indexed codebases
- See detailed statistics (chunk count, file count, languages)
- Rename or delete codebases
- Manage chunk sets from different ingestion runs

## Configuration

Create a configuration file at `~/.codebase-memory/config.json`:

```json
{
  "chromadb": {
    "persistPath": "~/.codebase-memory/chromadb"
  },
  "embedding": {
    "modelName": "Xenova/all-MiniLM-L6-v2",
    "cachePath": "~/.codebase-memory/models"
  },
  "server": {
    "port": 8008,
    "host": "localhost"
  },
  "ingestion": {
    "batchSize": 100,
    "maxFileSize": 1048576
  },
  "search": {
    "defaultMaxResults": 50,
    "cacheTimeoutSeconds": 60
  },
  "logging": {
    "level": "info"
  }
}
```

## Supported Languages

- C# (`.cs`)
- Java (`.java`) - JDK 22+
- JavaScript (`.js`, `.jsx`)
- TypeScript (`.ts`, `.tsx`)
- Python (`.py`)

## Architecture

The system consists of three entry points:

1. **MCP Server** (`mcp-server`): Exposes search tools to AI assistants
2. **Ingestion CLI** (`ingest`): Indexes codebases locally
3. **Manager UI** (`manager`): Web interface for management

All components share:
- **ChromaDB**: Local vector database
- **Hugging Face Transformers**: Local embedding generation
- **Tree-sitter**: AST-aware code parsing

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Security audit
npm run security
```

## License

MIT

## Author

Teknologika
