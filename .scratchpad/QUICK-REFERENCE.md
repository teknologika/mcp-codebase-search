# Quick Reference: builtinCatalog.ts Indexing Issue

## Problem
`/Users/bruce/GitHub/chisel/src/tools/builtinCatalog.ts` exists but isn't indexed in codebase search.

## Root Cause
Files with only const/let/var exports produce zero chunks because tree-sitter parser doesn't extract `lexical_declaration` node types.

## Current Behavior
Only these node types are extracted as chunks:
- Functions, classes, methods, interfaces ✓
- Const/let/var exports ✗
- Type aliases ✗
- Enums ✗

## Solution Files Created
1. `.scratchpad/builtinCatalog-debug.md` - Full analysis and evidence
2. `.scratchpad/builtinCatalog-solution.md` - Detailed implementation plan
3. `.scratchpad/debug-parsing.ts` - Debug script (not yet run)

## Next Steps
1. Implement solution from `builtinCatalog-solution.md`
2. Modify `src/domains/parsing/tree-sitter-parsing.service.ts`
3. Update `src/shared/types/index.ts` 
4. Add tests
5. Run `update_codebase_scan` on all codebases

## Key Files
- Parser: `src/domains/parsing/tree-sitter-parsing.service.ts` (line 26-58)
- Types: `src/shared/types/index.ts`
- Tests: `src/domains/parsing/__tests__/tree-sitter-parsing.service.test.ts`

## Recommended Approach
**Hybrid solution:**
1. Add support for `lexical_declaration`, `type_alias_declaration`, `enum_declaration`
2. Add file-level fallback for remaining zero-chunk files
3. Update ChunkType: add 'export', 'type', 'enum', 'file'

## Impact
- Affects all files with only exports/types/enums
- Will increase database size by ~10-20%
- Will achieve 100% file coverage
- Improves search for configuration and type files
