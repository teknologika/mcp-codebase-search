# Requirements Document: Codebase Memory MCP Server

## Introduction

The Codebase Memory MCP Server is a local-first semantic search system that enables LLM coding assistants to reliably discover existing code in a codebase. The system prevents duplicate implementations and wrong-file edits by providing semantic search capabilities through the Model Context Protocol (MCP). It uses local embeddings, Tree-sitter-aware chunking, and ChromaDB for vector storage, ensuring all operations run locally without cloud dependencies.

## Glossary

- **MCP_Server**: The Model Context Protocol server component that exposes search tools to LLM assistants
- **Ingestion_CLI**: Command-line interface for indexing codebase directories
- **Manager_UI**: Web-based interface for managing codebases and viewing statistics
- **Fastify_Server**: HTTP server hosting the Manager_UI and API endpoints
- **LanceDB**: Local file-based vector database for storing embeddings and metadata
- **Tree_Sitter**: Parser generator tool for AST-aware code chunking
- **Chunk**: A semantically meaningful unit of code (function, class, method) with metadata
- **Chunk_Set**: A collection of chunks belonging to a specific codebase ingestion
- **Codebase**: A named, indexed repository with associated chunks and metadata
- **Embedding**: Vector representation of code chunks for semantic search
- **Supported_Language**: Programming languages with Tree-sitter grammar support (C#, Java JDK22+, JavaScript, TypeScript, Python)
- **Unsupported_Language**: Programming languages without Tree-sitter grammar support

## Requirements

### Requirement 1: MCP Server Discovery Tools

**User Story:** As an LLM coding assistant, I want to discover what codebases are available and search their contents, so that I can find existing implementations and avoid duplicates.

#### Acceptance Criteria

1. WHEN an assistant calls `list_codebases`, THE MCP_Server SHALL return all indexed codebases with their names, paths, and statistics
2. WHEN an assistant calls `search_codebases` with a query and optional codebase filter, THE MCP_Server SHALL return semantically relevant code chunks ranked by similarity
3. WHEN an assistant calls `get_codebase_stats` with a codebase name, THE MCP_Server SHALL return detailed statistics including chunk count, file count, language distribution, and last ingestion timestamp
4. WHEN an assistant calls `open_codebase_manager`, THE MCP_Server SHALL launch the Manager_UI in the default browser
5. WHEN search results are returned, THE MCP_Server SHALL include file path, line numbers, language, chunk type, and similarity score for each result

### Requirement 2: Local Ingestion Pipeline

**User Story:** As a developer, I want to index my codebase locally, so that the MCP server can provide search capabilities without sending my code to external services.

#### Acceptance Criteria

1. WHEN the Ingestion_CLI is invoked with a directory path and codebase name, THE system SHALL recursively scan all files in the directory
2. WHEN a file with a Supported_Language extension is encountered, THE system SHALL parse it using Tree_Sitter and extract semantic chunks
3. WHEN a file with an Unsupported_Language extension is encountered, THE system SHALL log a warning and skip the file
4. WHEN chunks are extracted, THE system SHALL generate embeddings using local Hugging Face transformers
5. WHEN embeddings are generated, THE system SHALL store them in LanceDB with metadata including file path, line range, language, chunk type, and codebase name
6. WHEN ingestion completes, THE system SHALL output statistics including total files processed, chunks created, and languages detected

### Requirement 3: Tree-Sitter Code Chunking

**User Story:** As a system, I want to chunk code at semantic boundaries, so that search results are meaningful and contextually complete.

#### Acceptance Criteria

1. WHEN parsing C# files, THE system SHALL extract chunks for classes, methods, properties, and interfaces
2. WHEN parsing Java files (JDK22+), THE system SHALL extract chunks for classes, methods, fields, and interfaces
3. WHEN parsing JavaScript/TypeScript files, THE system SHALL extract chunks for functions, classes, methods, and exported declarations
4. WHEN parsing Python files, THE system SHALL extract chunks for functions, classes, and methods
5. WHEN a chunk is extracted, THE system SHALL include surrounding context (docstrings, comments) within the chunk boundaries
6. WHEN a file contains nested structures, THE system SHALL create separate chunks for each semantic unit while preserving hierarchy metadata

### Requirement 4: Local Embedding Generation

**User Story:** As a system, I want to generate embeddings locally, so that no code leaves the developer's machine.

#### Acceptance Criteria

1. WHEN the system initializes, THE system SHALL load the embedding model from `@huggingface/transformers` locally
2. WHEN a code chunk is ready for embedding, THE system SHALL generate a vector representation using the loaded model
3. WHEN embedding generation fails, THE system SHALL log the error and skip the chunk
4. WHEN the embedding model is not cached locally, THE system SHALL download it once and cache it for future use
5. THE system SHALL use a consistent embedding model across all ingestion operations to ensure vector compatibility

### Requirement 5: LanceDB Vector Storage

**User Story:** As a system, I want to persist embeddings and metadata locally, so that search operations are fast and data remains private.

#### Acceptance Criteria

1. WHEN the system starts, THE system SHALL initialize LanceDB with a local persistence directory
2. WHEN storing chunks, THE system SHALL create or update tables per codebase
3. WHEN storing embeddings, THE system SHALL include metadata: file path, start line, end line, language, chunk type, codebase name, and ingestion timestamp
4. WHEN searching, THE system SHALL query LanceDB using vector similarity with metadata filters
5. WHEN a codebase is deleted, THE system SHALL remove its table from LanceDB

### Requirement 6: Language Support Detection

**User Story:** As a developer, I want to know when files cannot be indexed, so that I understand the coverage limitations of my codebase search.

#### Acceptance Criteria

1. WHEN the Ingestion_CLI encounters a file, THE system SHALL check if its extension maps to a Supported_Language
2. WHEN a file has an Unsupported_Language extension, THE system SHALL log a warning with the file path and detected language
3. WHEN ingestion completes, THE system SHALL report counts of supported vs unsupported files
4. THE system SHALL support file extensions: .cs (C#), .java (Java), .js/.jsx (JavaScript), .ts/.tsx (TypeScript), .py (Python)
5. WHEN a file has no extension or an unknown extension, THE system SHALL skip it silently

### Requirement 7: Fastify Manager UI

**User Story:** As a developer, I want a web interface to manage my indexed codebases, so that I can view statistics, rename, and delete codebases without using the CLI.

#### Acceptance Criteria

1. WHEN the Fastify_Server starts, THE system SHALL serve a single-page web application on a configurable port
2. WHEN the Manager_UI loads, THE system SHALL display a list of all indexed codebases with their statistics
3. WHEN a user selects a codebase, THE Manager_UI SHALL display detailed statistics including chunk count, file count, language distribution, and last ingestion date
4. WHEN a user renames a codebase, THE Manager_UI SHALL update the codebase name in LanceDB and refresh the display
5. WHEN a user deletes a codebase, THE Manager_UI SHALL remove all associated chunks from LanceDB and refresh the display
6. WHEN a user deletes a chunk set, THE Manager_UI SHALL remove chunks from a specific ingestion timestamp and refresh the display

### Requirement 8: HTTP API Endpoints

**User Story:** As a developer or external tool, I want HTTP endpoints to interact with the codebase memory system, so that I can integrate it with other tools.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/codebases`, THE Fastify_Server SHALL return a JSON array of all codebases with metadata
2. WHEN a POST request is made to `/api/search` with a query and optional filters, THE Fastify_Server SHALL return search results as JSON
3. WHEN a GET request is made to `/api/codebases/:name/stats`, THE Fastify_Server SHALL return detailed statistics for the specified codebase
4. WHEN a PUT request is made to `/api/codebases/:name` with a new name, THE Fastify_Server SHALL rename the codebase
5. WHEN a DELETE request is made to `/api/codebases/:name`, THE Fastify_Server SHALL delete the codebase and return success status
6. WHEN any API error occurs, THE Fastify_Server SHALL return appropriate HTTP status codes and error messages

### Requirement 9: Package Structure and Entry Points

**User Story:** As a developer, I want a single npm package with clear entry points, so that I can easily install and use the different components.

#### Acceptance Criteria

1. THE system SHALL be distributed as a single npm package named `@teknologika/mcp-codebase-search`
2. THE package SHALL provide three executable entry points: `mcp-server`, `ingest`, and `manager`
3. WHEN `mcp-server` is executed, THE system SHALL start the MCP_Server
4. WHEN `ingest` is executed with required arguments, THE system SHALL start the Ingestion_CLI
5. WHEN `manager` is executed, THE system SHALL start the Fastify_Server and open the Manager_UI
6. THE package SHALL include TypeScript type definitions for all public APIs

### Requirement 10: Configuration Management

**User Story:** As a developer, I want to configure the system through environment variables and config files, so that I can customize behavior without modifying code.

#### Acceptance Criteria

1. WHEN the system starts, THE system SHALL read configuration from environment variables and a config file
2. THE system SHALL support configuration for: LanceDB persistence path, embedding model name, Fastify server port, and MCP server transport settings
3. WHEN a required configuration value is missing, THE system SHALL use sensible defaults
4. WHEN an invalid configuration value is provided, THE system SHALL log an error and exit with a non-zero status code
5. THE system SHALL validate all configuration values at startup

### Requirement 11: Error Handling and Logging

**User Story:** As a developer, I want clear error messages and logs, so that I can diagnose issues when they occur.

#### Acceptance Criteria

1. WHEN any component encounters an error, THE system SHALL log the error with context including component name, operation, and stack trace
2. WHEN the Ingestion_CLI fails to parse a file, THE system SHALL log the error and continue processing other files
3. WHEN the MCP_Server receives an invalid tool call, THE system SHALL return a structured error response
4. WHEN the Fastify_Server encounters an API error, THE system SHALL return appropriate HTTP status codes with error details
5. THE system SHALL use structured logging with configurable log levels (debug, info, warn, error)

### Requirement 12: Performance and Caching

**User Story:** As a developer, I want fast search responses, so that the LLM assistant can quickly find relevant code.

#### Acceptance Criteria

1. WHEN the embedding model is loaded, THE system SHALL cache it in memory for the duration of the process
2. WHEN search queries are executed, THE system SHALL return results within 500ms for codebases under 10,000 chunks
3. WHEN multiple search queries are made with identical parameters, THE system SHALL cache results for 60 seconds
4. WHEN ingestion is running, THE system SHALL process files in batches to optimize memory usage
5. THE system SHALL limit search results to a configurable maximum (default 50 results)

### Requirement 13: Schema Versioning

**User Story:** As a system maintainer, I want schema versioning for LanceDB tables, so that future updates can migrate data without breaking existing installations.

#### Acceptance Criteria

1. WHEN creating a LanceDB table, THE system SHALL include a schema version in the table metadata
2. WHEN the system starts, THE system SHALL check the schema version of existing tables
3. WHEN a schema version mismatch is detected, THE system SHALL log a warning and provide migration instructions
4. THE system SHALL store the current schema version in a constant accessible to all components
5. WHEN a new schema version is introduced, THE system SHALL document the migration path

### Requirement 14: Re-ingestion Model

**User Story:** As a developer, I want to re-ingest my codebase when it changes, so that search results reflect the current state of the code.

#### Acceptance Criteria

1. WHEN the Ingestion_CLI is invoked for an existing codebase, THE system SHALL delete all existing chunks for that codebase
2. WHEN re-ingestion starts, THE system SHALL create a new chunk set with a fresh timestamp
3. WHEN re-ingestion completes, THE system SHALL report the difference in chunk count compared to the previous ingestion
4. THE system SHALL NOT support incremental updates or file watching
5. WHEN a user wants to update a codebase, THE system SHALL require a full re-ingestion

### Requirement 15: MCP Protocol Compliance

**User Story:** As an MCP client, I want the server to comply with the MCP specification, so that I can reliably integrate with it.

#### Acceptance Criteria

1. WHEN the MCP_Server starts, THE system SHALL advertise all available tools with their schemas
2. WHEN a tool is called, THE MCP_Server SHALL validate input parameters against the tool schema
3. WHEN a tool call succeeds, THE MCP_Server SHALL return results in the MCP-compliant format
4. WHEN a tool call fails, THE MCP_Server SHALL return errors in the MCP-compliant format
5. THE MCP_Server SHALL support stdio transport for communication with MCP clients
