# Implementation Plan: Codebase Memory MCP Server

## Overview

This implementation plan breaks down the codebase memory MCP server into incremental phases: Foundations, Core Services, Ingestion Pipeline, MCP Server Tools, Manager UI & API, and Operational Hardening. Each task builds on previous work with checkpoints to ensure stability.

## Tasks

- [ ] 1. Phase 1: Foundations - Project Setup and Core Infrastructure
  - [x] 1.1 Initialize project structure and configuration
    - Create package.json with name `@teknologika/mcp-codebase-search`
    - Set up TypeScript configuration for Node.js 23+
    - Create directory structure: src/bin, src/domains, src/infrastructure, src/shared, src/ui
    - Add .gitignore for node_modules, dist, and local data directories
    - Configure all dependencies and dev dependencies
    - _Requirements: 9.1, 9.6_

  - [x] 1.2 Implement configuration management system
    - Create Config interface with all configuration options
    - Implement config loader that reads from environment variables and config file
    - Add validation for required config values with AJV schemas
    - Implement default values (port 8008, batch size 100, max results 50, etc.)
    - Support path expansion for tilde (~) in file paths
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 1.3 Write property tests for configuration management
    - **Property 21: Configuration Loading** - For any valid config file or env vars, all values should be loaded and accessible
    - **Property 22: Configuration Defaults** - For any missing optional config value, the documented default should be used
    - **Property 23: Configuration Validation** - For any invalid config value, system should exit with error before starting services
    - **Validates: Requirements 10.1, 10.3, 10.4, 10.5**

  - [x] 1.4 Implement shared types
    - Create TypeScript interfaces for all domain models (Chunk, CodebaseMetadata, SearchResult, etc.)
    - Define type aliases for Language, ChunkType, LogLevel
    - Export all types through index.ts barrel file
    - _Requirements: 9.6_

  - [x] 1.5 Set up structured logging with Pino
    - Create logger factory with configurable log levels
    - Implement structured log format with timestamp, level, component, operation, context
    - Add log redaction for sensitive data
    - Create child logger factory for component-specific logging
    - _Requirements: 11.5_

  - [ ]* 1.6 Write property tests for logging
    - **Property 24: Error Logging Completeness** - For any error, logged output should include component, operation, message, and stack trace
    - **Property 26: Structured Logging Levels** - For any log level config, only messages at or above that level should be output
    - **Validates: Requirements 11.1, 11.5**

- [x] 2. Checkpoint - Verify foundations
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Phase 2: Core Services - ChromaDB and Language Support
  - [x] 3.1 Initialize ChromaDB client wrapper
    - Create ChromaDB client wrapper with local persistence configuration
    - Implement connection initialization with error handling
    - Add schema version constant (1.0.0)
    - Implement collection naming pattern: `codebase_{name}_{schemaVersion}`
    - Add methods for collection creation, deletion, and metadata queries
    - _Requirements: 5.1, 5.2, 13.4_

  - [ ]* 3.2 Write unit tests for ChromaDB client
    - Test successful connection with valid config
    - Test error handling for invalid persistence path
    - Test collection naming pattern generation
    - Test collection CRUD operations
    - _Requirements: 5.1, 5.2_

  - [x] 3.3 Implement language detection service
    - Create language support mapping for extensions (.cs, .java, .js, .jsx, .ts, .tsx, .py)
    - Map extensions to Tree-sitter grammar names
    - Implement language detection from file extension
    - Add supported/unsupported language classification
    - _Requirements: 6.1, 6.4, 6.5_

  - [ ]* 3.4 Write property tests for language detection
    - **Property 18: Language Detection Accuracy** - For any file with known extension, detected language should match extension mapping
    - **Validates: Requirements 6.1**

  - [x] 3.5 Implement file scanner service
    - Create recursive file discovery that traverses directories
    - Filter files by supported/unsupported extensions
    - Respect .gitignore patterns and skip hidden directories
    - Track file statistics during scanning
    - _Requirements: 2.1_

  - [ ]* 3.6 Write property tests for file scanner
    - **Property 5: Recursive File Discovery** - For any directory structure, all files in nested subdirectories should be discovered
    - **Validates: Requirements 2.1**

- [-] 4. Checkpoint - Verify core services
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Phase 3: Parsing and Embedding Services
  - [~] 5.1 Implement Tree-sitter parsing service
    - Load Tree-sitter grammars for supported languages (C#, Java, JavaScript, TypeScript, Python)
    - Implement AST traversal to find semantic nodes (functions, classes, methods, interfaces, properties)
    - Extract chunk metadata: start line, end line, chunk type, content
    - Include surrounding context (comments, docstrings) in chunks
    - Handle nested structures by creating separate chunks for each semantic unit
    - Define chunk extraction rules per language based on design document
    - _Requirements: 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 5.2 Write property tests for parsing service
    - **Property 6: Supported Language Parsing** - For any file with supported extension, at least one semantic chunk should be extracted
    - **Property 11: Context Preservation** - For any chunk with comments/docstrings, extracted content should include them
    - **Property 12: Nested Structure Chunking** - For any file with nested structures, separate chunks should be created for each unit
    - **Validates: Requirements 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

  - [ ]* 5.3 Write unit tests for parsing edge cases
    - Test parsing empty files
    - Test parsing files with only comments
    - Test parsing deeply nested structures
    - Test parsing malformed code (should handle gracefully)
    - _Requirements: 2.2, 11.2_

  - [~] 5.4 Implement embedding service with Hugging Face transformers
    - Initialize embedding model (Xenova/all-MiniLM-L6-v2) with local caching
    - Implement single embedding generation for code chunks
    - Implement batch embedding generation for efficiency
    - Add error handling for embedding failures with logging and skip logic
    - Cache model in memory for process lifetime
    - Track embedding model version for consistency
    - _Requirements: 2.4, 4.1, 4.2, 4.3, 4.5, 12.1_

  - [ ]* 5.5 Write property tests for embedding service
    - **Property 8: Embedding Generation** - For any code chunk, generated embedding should have consistent dimensionality
    - **Property 13: Embedding Model Consistency** - For any two ingestion operations, embedding model name/version should be identical
    - **Property 14: Embedding Error Recovery** - For any chunk where embedding fails, system should log error and continue with remaining chunks
    - **Property 27: Embedding Model Caching** - For any process lifetime, model should be loaded exactly once
    - **Validates: Requirements 2.4, 4.2, 4.3, 4.5, 12.1**

- [~] 6. Checkpoint - Verify parsing and embedding
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Phase 4: Codebase and Search Services
  - [~] 7.1 Implement codebase service for CRUD operations
    - Create methods for listing codebases with metadata (name, path, chunk count, file count, last ingestion)
    - Implement codebase statistics retrieval with language distribution and chunk types
    - Add codebase rename functionality with metadata propagation to all chunks
    - Implement codebase deletion with ChromaDB collection removal
    - Add chunk set deletion by ingestion timestamp
    - Query ChromaDB for aggregated statistics
    - _Requirements: 1.1, 1.3, 7.3, 7.4, 7.5, 7.6, 8.1, 8.3_

  - [ ]* 7.2 Write property tests for codebase service
    - **Property 1: Codebase Retrieval Completeness** - For any set of indexed codebases, list_codebases should return all with complete metadata
    - **Property 4: Statistics Accuracy** - For any codebase, statistics should accurately reflect actual counts in ChromaDB
    - **Property 17: Codebase Deletion Completeness** - For any codebase, deletion should remove collection and all chunks
    - **Property 19: Codebase Rename Propagation** - For any codebase, renaming should update all chunk metadata
    - **Validates: Requirements 1.1, 1.3, 5.5, 7.4, 7.5, 8.4, 8.5**

  - [~] 7.3 Implement search service with semantic search
    - Create search method accepting query, optional codebase filter, optional language filter
    - Generate query embedding using embedding service
    - Query ChromaDB with vector similarity and metadata filters
    - Rank results by similarity score in descending order
    - Limit results to configurable maximum (default 50)
    - Format results with all required metadata (file path, line numbers, language, chunk type, content, similarity score, codebase name)
    - Implement search result caching with 60-second TTL
    - Track query time for performance monitoring
    - _Requirements: 1.2, 1.5, 5.4, 8.2, 12.3, 12.5_

  - [ ]* 7.4 Write property tests for search service
    - **Property 2: Search Result Relevance and Ranking** - For any search query with filters, results should match filters and be ranked by similarity descending
    - **Property 3: Search Result Metadata Completeness** - For any search result, all required fields should be present
    - **Property 16: Search Filter Application** - For any search with metadata filters, all results should satisfy all filter conditions
    - **Property 28: Search Result Caching** - For any two identical queries within 60s, second should return cached results
    - **Property 30: Search Result Limiting** - For any search query, returned results should not exceed configured maximum
    - **Validates: Requirements 1.2, 1.5, 5.4, 12.3, 12.5**

- [~] 8. Checkpoint - Verify codebase and search services
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Phase 5: Ingestion Pipeline
  - [~] 9.1 Implement ingestion orchestration service
    - Create ingestion orchestrator coordinating scanning, parsing, embedding, and storage
    - Implement batch processing with configurable batch size (default 100)
    - Add progress tracking and statistics collection
    - Handle re-ingestion by deleting existing chunks before storing new ones
    - Generate unique ingestion timestamps for chunk sets
    - Report ingestion statistics (files processed, chunks created, languages detected, duration)
    - Track supported vs unsupported files with counts by extension
    - Log warnings for unsupported files with file paths
    - Calculate and report diff in chunk count for re-ingestion
    - _Requirements: 2.1, 2.3, 2.5, 2.6, 6.2, 6.3, 12.4, 14.1, 14.2, 14.3_

  - [ ]* 9.2 Write property tests for ingestion service
    - **Property 7: Unsupported Language Handling** - For any file with unsupported extension, system should skip it and log warning
    - **Property 9: Storage Round-Trip Preservation** - For any chunk with metadata, storing and retrieving should preserve all metadata exactly
    - **Property 10: Ingestion Statistics Accuracy** - For any ingestion, reported statistics should match actual processing counts
    - **Property 15: Collection Management** - For any codebase, storing chunks should create/update collection with correct naming pattern
    - **Property 29: Batch Processing** - For any ingestion, files should be processed in batches of configured size
    - **Property 33: Re-ingestion Cleanup** - For any re-ingested codebase, all previous chunks should be deleted before new ones stored
    - **Property 34: Ingestion Timestamp Uniqueness** - For any two sequential ingestions, timestamps should be different
    - **Property 35: Re-ingestion Diff Reporting** - For any re-ingestion, system should report chunk count difference vs previous
    - **Validates: Requirements 2.3, 2.5, 2.6, 5.2, 6.2, 6.3, 12.4, 14.1, 14.2, 14.3**

  - [~] 9.3 Create ingestion CLI entry point
    - Implement CLI with commander.js for argument parsing
    - Accept --path (required), --name (required), and --config (optional) arguments
    - Validate required arguments and exit with error if missing
    - Display progress bar during ingestion phases
    - Output detailed statistics on completion (files, chunks, languages, duration)
    - Handle errors gracefully with clear error messages
    - _Requirements: 9.2, 9.4_

  - [ ]* 9.4 Write unit tests for ingestion CLI
    - Test CLI argument parsing
    - Test error handling for missing required arguments
    - Test statistics output format
    - Test progress reporting
    - _Requirements: 9.4_

- [~] 10. Checkpoint - Verify ingestion pipeline
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Phase 6: MCP Server Implementation
  - [~] 11.1 Define MCP tool schemas
    - Create JSON schemas for list_codebases tool (no input, returns codebase array)
    - Create JSON schemas for search_codebases tool (query + optional filters, returns search results)
    - Create JSON schemas for get_codebase_stats tool (name input, returns detailed stats)
    - Create JSON schemas for open_codebase_manager tool (no input, returns URL)
    - Add schema descriptions for each tool and all parameters
    - Define input validation rules and output formats
    - _Requirements: 15.1_

  - [~] 11.2 Implement MCP server with stdio transport
    - Create MCP server that advertises all tools with schemas on startup
    - Implement tool call routing to appropriate services (codebase, search)
    - Add input validation against tool schemas using AJV
    - Format successful responses in MCP-compliant format
    - Format error responses in MCP-compliant format with error codes
    - Handle list_codebases by delegating to codebase service
    - Handle search_codebases by delegating to search service
    - Handle get_codebase_stats by delegating to codebase service
    - Handle open_codebase_manager by launching browser to localhost:8008
    - Implement stdio transport for communication with MCP clients
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 11.3, 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 11.3 Write property tests for MCP server
    - **Property 25: MCP Input Validation** - For any tool call with invalid parameters, server should return structured error without executing
    - **Property 36: MCP Response Format Compliance** - For any successful tool call, response should conform to MCP specification
    - **Property 37: MCP Error Format Compliance** - For any failed tool call, error response should conform to MCP specification
    - **Validates: Requirements 11.3, 15.2, 15.3, 15.4**

  - [ ]* 11.4 Write unit tests for MCP tools
    - Test each tool with valid inputs
    - Test each tool with invalid inputs
    - Test error handling for service failures
    - Test browser launching for open_codebase_manager
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [~] 11.5 Create MCP server entry point
    - Implement mcp-server executable that starts the MCP server
    - Load configuration from environment and config file
    - Initialize all services (ChromaDB, embedding, codebase, search)
    - Start stdio transport listener
    - Add graceful shutdown handling for SIGINT/SIGTERM
    - Log startup information and configuration
    - _Requirements: 9.2, 9.3_

  - [ ]* 11.6 Write unit tests for MCP server entry point
    - Test server initialization with valid config
    - Test error handling for initialization failures
    - Test graceful shutdown
    - _Requirements: 9.3_

- [~] 12. Checkpoint - Verify MCP server functionality
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Phase 7: Fastify Manager UI and API
  - [~] 13.1 Implement HTTP API endpoints
    - Create GET /api/codebases endpoint returning all codebases with metadata
    - Create POST /api/search endpoint with query and filter parameters
    - Create GET /api/codebases/:name/stats endpoint for detailed statistics
    - Create PUT /api/codebases/:name endpoint for renaming
    - Create DELETE /api/codebases/:name endpoint for deletion
    - Create DELETE /api/codebases/:name/chunk-sets/:timestamp endpoint for chunk set deletion
    - Add input validation with AJV schemas for all endpoints
    - Implement error handling with appropriate HTTP status codes (400, 404, 500)
    - Return JSON error responses with code and message
    - Add request logging for all endpoints
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 11.4_

  - [ ]* 13.2 Write property tests for HTTP API
    - **Property 20: API Error Response Format** - For any API error, response should include appropriate HTTP status and JSON error with code/message
    - **Validates: Requirements 8.6, 11.4**

  - [ ]* 13.3 Write unit tests for API endpoints
    - Test each endpoint with valid inputs
    - Test each endpoint with invalid inputs
    - Test 404 responses for non-existent resources
    - Test error handling for service failures
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [~] 13.4 Create single-page manager UI
    - Build HTML page with embedded CSS and JavaScript
    - Display list of all codebases with statistics in a table
    - Add codebase selection to show detailed statistics (language distribution, chunk types)
    - Implement rename functionality with inline editing
    - Implement delete functionality with confirmation dialog
    - Add chunk set deletion interface with timestamp selection
    - Use fetch API to call backend endpoints
    - Style with minimal, clean design
    - Add error handling and user feedback for all operations
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [~] 13.5 Implement Fastify server
    - Create Fastify server with configurable port (default 8008) and host
    - Register @fastify/helmet for security headers
    - Serve static UI from /ui/manager directory
    - Register all API routes under /api prefix
    - Add global error handler for unhandled errors
    - Add request logging with Pino
    - Configure CORS if needed for development
    - _Requirements: 7.1, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 13.6 Write unit tests for Fastify server
    - Test server starts on configured port
    - Test security headers are applied
    - Test static file serving
    - Test API route registration
    - Test global error handler
    - _Requirements: 7.1_

  - [~] 13.7 Create manager entry point
    - Implement manager executable that starts Fastify server
    - Load configuration from environment and config file
    - Initialize all services (ChromaDB, codebase, search)
    - Start Fastify server on configured port
    - Open default browser to http://localhost:{port}
    - Add graceful shutdown handling
    - Log server URL and startup information
    - _Requirements: 9.2, 9.5_

  - [ ]* 13.8 Write unit tests for manager entry point
    - Test server initialization with valid config
    - Test error handling for port conflicts
    - Test graceful shutdown
    - _Requirements: 9.5_

- [~] 14. Checkpoint - Verify manager UI and API
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Phase 8: Operational Hardening and Polish
  - [~] 15.1 Implement schema versioning
    - Add schema version to all ChromaDB collection metadata
    - Implement schema version checking on startup
    - Log warnings for version mismatches with migration instructions
    - Document migration path in README
    - Store schema version constant in shared config
    - _Requirements: 13.1, 13.2, 13.3, 13.5_

  - [ ]* 15.2 Write property tests for schema versioning
    - **Property 31: Schema Version Metadata** - For any ChromaDB collection, metadata should include schema version matching system constant
    - **Property 32: Schema Version Validation** - For any existing collection, system should check version on startup and log warning if mismatch
    - **Validates: Requirements 13.1, 13.2, 13.3**

  - [~] 15.3 Add comprehensive error handling review
    - Review all components for error handling completeness
    - Ensure all errors are logged with context (component, operation, stack trace)
    - Verify parsing errors don't stop ingestion
    - Verify embedding errors are logged and skipped
    - Verify MCP errors return structured responses
    - Verify API errors return appropriate status codes
    - Add error recovery strategies where appropriate
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [~] 15.4 Optimize performance
    - Verify embedding model is cached in memory
    - Verify search results are cached for 60 seconds
    - Verify batch processing uses configured batch size
    - Add performance logging for slow operations (>500ms)
    - Test memory usage during large ingestions
    - Profile and optimize hot paths if needed
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [~] 15.5 Create comprehensive README
    - Document installation instructions (npm install -g)
    - Document usage for all three entry points (mcp-server, ingest, manager)
    - Document configuration options with examples
    - Document MCP client configuration for Claude Desktop and other clients
    - Add troubleshooting section for common issues
    - Document supported languages and file extensions
    - Add examples of search queries and expected results
    - Include architecture diagram
    - Add contributing guidelines
    - _Requirements: 9.1_

  - [~] 15.6 Create example configuration file
    - Create config.example.json with all options documented
    - Include inline comments explaining each configuration value
    - Document default values for each option
    - Add to README with instructions for customization
    - Create .env.example with environment variable examples
    - _Requirements: 10.1, 10.2_

  - [~] 15.7 Add integration tests
    - Test complete ingestion workflow (scan → parse → embed → store → verify)
    - Test complete search workflow (ingest → query → embed → search → format → verify)
    - Test MCP client interaction (call all tools → verify responses)
    - Test API client interaction (CRUD operations → verify state changes)
    - Test all three entry points can start without conflicts
    - Test re-ingestion workflow (ingest → re-ingest → verify cleanup)
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [~] 15.8 Add package.json scripts and finalize metadata
    - Verify build script compiles TypeScript correctly
    - Verify test script runs with coverage reporting
    - Verify lint script catches code quality issues
    - Configure bin entries for all three executables
    - Add package metadata (description, keywords, author, license, repository)
    - Verify engines requirement for Node.js 23+
    - Add prepublishOnly script for safety
    - _Requirements: 9.1, 9.2, 9.6_

- [~] 16. Final checkpoint - Complete system verification
  - Run full test suite with coverage (target 80%+)
  - Test all three entry points manually
  - Verify MCP integration with Claude Desktop
  - Test ingestion with real codebases
  - Verify search quality with sample queries
  - Check for memory leaks during long-running operations
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each phase
- Property tests validate universal correctness properties with minimum 100 iterations
- Unit tests validate specific examples and edge cases
- Integration tests verify complete workflows across components
- Task 1.1 and 1.2 are already complete based on current implementation
- Configuration management has full implementation and unit tests, property tests are optional
