# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.13] - 2026-04-04

### Changed
- Bumped the package version to `0.1.13`.

## [0.1.12] - 2026-03-21

### Added
- **Staleness warnings**: `search_codebases` and `get_chunk_content` now include a `staleWarning` field when the index is more than 10 minutes old, with the exact `update_codebase_scan` call needed to refresh
- **Expanded MCP tool surface**: `search_codebases` now supports `topContentResults`, and the MCP server advertises `get_file_content` and `get_adjacent_chunks` alongside the existing tools
- **`lastScanAge` in `list_codebases`**: Each codebase entry now includes `lastScanAge` (seconds since last scan) so callers can assess index freshness without running a search
- **`get_chunk_content` fuzzy matching**: When an exact line-range match fails (e.g. after incremental rescans shift line numbers), a ±5 line fuzzy search is used automatically. The response includes `lineNumberDrift` indicating how much the chunk shifted
- **`get_chunk_content` path error clarity**: Absolute paths that cannot be normalised now throw a descriptive error instead of silently falling back to an always-failing query
- **`update_codebase_scan` verbose mode**: New `verbose` parameter (default `false`). When `true`, response includes `addedFilePaths`, `modifiedFilePaths`, and `deletedFilePaths` arrays
- **`update_codebase_scan` cache clearing**: Search cache is automatically cleared after every successful rescan. Response includes `cacheCleared: true`
- **Lock file exclusion**: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `composer.lock`, `Gemfile.lock`, and `Cargo.lock` are excluded from indexing by default
- **`codebaseName` input validation**: Tool schemas now enforce `^[a-zA-Z0-9_-]{1,64}$`, producing clear validation errors for invalid names
- **Folder name pre-population**: In the Manager UI ingest form, selecting a folder via the browser or typing a path now auto-populates the codebase name field from the folder name

### Fixed
- **Dead code in `listCodebases`**: Removed unreachable duplicate loop left over from a prior refactor
- **Search cache not invalidated after rescan**: `update_codebase_scan` now correctly clears the in-memory search cache
- **Silent error swallowing in `listCodebases`**: The backward-compatibility chunk-table path now logs a `warn` instead of silently ignoring metadata read failures
- **`applyNameBoost` log flood**: Downgraded the per-result "Name boost check" log from `info` to `debug`, eliminating up to 500 spurious log lines per search query
- **`respectGitignore` defaulting to `false` in Manager UI**: Full ingest via the web form now correctly defaults to respecting `.gitignore`

### Changed
- **Triple JSDoc collapsed**: `updateLastIngestionTimestamp` stub now has a single clean comment block with a clear TODO

## [0.1.11] - 2026-03-08

### Fixed
- **Rescan crash with no changes**: Fixed "Illegal instruction: 4" segmentation fault when rescanning codebases with no file changes
  - Added explicit memory cleanup after loading chunk data from database
  - Clear rows array immediately after extracting file hash map
  - Clear file maps before method completion to help garbage collection
  - Prevents LanceDB native code from encountering memory corruption during cleanup

## [0.1.8] - 2026-02-18

### Fixed
- **Rescan file-level chunk preservation**: Fixed bug where files containing only imports/exports were lost during rescan operations
  - Extended `rescanCodebase` to include the same file-level fallback logic as `ingestCodebase`

### Changed
- Improved consistency between `ingestCodebase` and `rescanCodebase` implementations

## [0.1.7] - 2026-02-17

### Fixed
- **CLI graceful shutdown**: Fixed mutex error during CLI ingestion cleanup
  - Added `close()` method to `LanceDBClientWrapper` for proper connection cleanup
  - Changed CLI from `process.exit(0)` to `process.exitCode = 0` for graceful shutdown
- **Rescan metadata corruption**: Fixed bug where `update_codebase_scan` corrupted codebase metadata
  - Changed MCP server to use `rescanCodebase` instead of `ingestCodebase` for updates

### Added
- File-level chunk fallback for files with only imports/exports
- Added `'file'` to `ChunkType` enum

## [0.1.6] - 2026-02-17

### Added
- Initial production release
- Local-first semantic search for codebases
- Tree-sitter AST-aware code chunking
- Multi-language support (TypeScript, JavaScript, Python, Java, C#)
- MCP server integration with stdio transport
- CLI ingestion tool (`mcp-codebase-ingest`)
- Web-based management UI (`mcp-codebase-manager`)
- Incremental rescan with file hash change detection
- Test and library file detection and filtering
- Gitignore support during ingestion

[Unreleased]: https://github.com/teknologika/mcp-codebase-search/compare/v0.1.12...HEAD
[0.1.12]: https://github.com/teknologika/mcp-codebase-search/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/teknologika/mcp-codebase-search/compare/v0.1.8...v0.1.11
[0.1.8]: https://github.com/teknologika/mcp-codebase-search/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/teknologika/mcp-codebase-search/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/teknologika/mcp-codebase-search/releases/tag/v0.1.6
