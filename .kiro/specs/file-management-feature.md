# File Management Feature Implementation Plan

## Overview
Backport document management feature from local-knowledge MCP, adapted for codebase search:
- View all files in a codebase (inline expansion)
- Delete individual files with all chunks
- See file metadata (chunk count, language, size, date)
- Immediate UI feedback with animations

## Terminology Mapping
- Knowledge Base → Codebase
- Document → File
- DocumentInfo → FileInfo
- documentType → language (Language type)

## Implementation Phases

### ✅ Phase 1: Type Definitions (COMPLETED)
- [x] Added `FileInfo` interface to `src/shared/types/index.ts`

### ✅ Phase 2: Service Layer (COMPLETED)
- [x] Added `listFiles()` method to CodebaseService
- [x] Added `deleteFile()` method to CodebaseService
- [x] Security: Path traversal prevention
- [x] Security: SQL injection prevention (escaped quotes)
- [x] LanceDB: Use backticks for case-sensitive field names

### ✅ Phase 3: MCP Integration (COMPLETED)
- [x] Added `LIST_FILES_SCHEMA` to tool-schemas.ts
- [x] Added to `ALL_TOOL_SCHEMAS` array
- [ ] Add handler in mcp-server.ts
- [ ] Add to tool routing switch

### Phase 4: REST API Routes
- [ ] GET `/api/codebases/:name/files` - List files
- [ ] DELETE `/api/codebases/:name/files` - Delete file
- [ ] Clear search cache after deletion

### Phase 5: Frontend HTML Template
- [ ] Update codebase table rows with expand button
- [ ] Add hidden files row below each codebase row
- [ ] Add loading indicator
- [ ] Add files list container

### Phase 6: Frontend JavaScript
- [ ] `toggleFiles()` - Expand/collapse files list
- [ ] `confirmDeleteFile()` - Delete with confirmation
- [ ] File icon helper functions
- [ ] Toast notifications
- [ ] Smooth animations

### Phase 7: Frontend CSS
- [ ] Expand icon rotation
- [ ] Files row styling
- [ ] File item layout
- [ ] Animations (spin, slideIn)
- [ ] Hover effects

## Key Differences from Knowledge Base MCP

1. **No Placeholder Chunks**: Codebase MCP doesn't use placeholder chunks
2. **Language Field**: Use `language` (Language type) instead of `documentType`
3. **Additional Metadata**: Include `isTestFile` and `isLibraryFile` flags
4. **File Icons**: Use language-based icons instead of document type icons

## Security Considerations
- Path traversal prevention: Reject `..` and leading `/`
- SQL injection prevention: Escape single quotes
- Input validation: Non-empty filePath
- LanceDB field names: Use backticks for `filePath`

## Testing Checklist
- [ ] Click codebase name to expand files
- [ ] Click again to collapse
- [ ] Verify file metadata displays correctly
- [ ] Delete a file and verify UI update
- [ ] Verify chunk count updates after deletion
- [ ] Delete last file and verify empty state
- [ ] Test with special characters in filename
- [ ] Test with single quotes in filename
- [ ] Verify MCP `list_files` tool works
- [ ] Verify search cache cleared after deletion

## Next Steps
1. Complete MCP handler implementation
2. Add REST API routes
3. Update frontend template
4. Add JavaScript functions
5. Add CSS styles
6. Test end-to-end
