# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.8] - 2026-02-18

### Fixed
- **Rescan file-level chunk preservation**: Fixed bug where files containing only imports/exports (like `builtinCatalog.ts`) were lost during rescan operations
  - Extended `rescanCodebase` to include the same file-level fallback logic as `ingestCodebase`
  - Files with zero AST chunks now create file-level chunks during rescan
  - Prevents data loss when rescanning codebases with import-only files

### Changed
- Improved consistency between `ingestCodebase` and `rescanCodebase` implementations
- Both methods now handle files with only imports/exports identically

## [0.1.7] - 2026-02-17

### Fixed
- **CLI graceful shutdown**: Fixed mutex error during CLI ingestion cleanup
  - Added `close()` method to `LanceDBClientWrapper` for proper connection cleanup
  - Changed CLI from `process.exit(0)` to `process.exitCode = 0` for graceful shutdown
  - Prevents `libc++abi: terminating due to uncaught exception` mutex errors
  - Ensures LanceDB tables are properly persisted to disk

- **Rescan metadata corruption**: Fixed bug where `update_codebase_scan` corrupted codebase metadata
  - Changed MCP server to use `rescanCodebase` instead of `ingestCodebase` for updates
  - Preserves codebase path and metadata during incremental updates
  - Prevents "Codebase has no stored path" errors after rescan

### Added
- File-level chunk fallback for files with only imports/exports
  - Files that produce zero AST chunks now create a single file-level chunk
  - Added `'file'` to `ChunkType` enum
  - Enables indexing of configuration and type definition files

## [0.1.6] - 2026-02-17

### Added
- Initial production release
- Local-first semantic search for codebases
- Tree-sitter AST-aware code chunking
- Multi-language support (TypeScript, JavaScript, Python, Java, C#)
- MCP server integration
- CLI ingestion tool
- Web-based management UI
- Incremental rescan functionality
- Test and library file detection
- Gitignore support

[0.1.8]: https://github.com/teknologika/mcp-codebase-search/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/teknologika/mcp-codebase-search/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/teknologika/mcp-codebase-search/releases/tag/v0.1.6
