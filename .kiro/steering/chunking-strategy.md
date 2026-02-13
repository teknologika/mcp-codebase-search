---
inclusion: auto
---

# Chunking Strategy

This document describes the hybrid chunking strategy used for code parsing and embedding generation.

## Overview

The system uses a **hybrid AST-based semantic chunking with token-aware splitting** approach optimized for the Xenova/all-MiniLM-L6-v2 embedding model.

## Model Constraints

**Xenova/all-MiniLM-L6-v2** characteristics:
- Produces 384-dimensional embeddings
- Trained on sequences up to 128 tokens
- Optimal performance with 500-800 token chunks
- Local execution without external API calls

## Configuration

Default settings in `src/shared/config/config.ts`:

```typescript
ingestion: {
  batchSize: 100,
  maxFileSize: 1048576,      // 1MB per file
  maxChunkTokens: 512,        // Optimal for embedding model
  chunkOverlapTokens: 50,     // Context preservation
}
```

Environment variables:
- `INGESTION_MAX_CHUNK_TOKENS` - Maximum tokens per chunk
- `INGESTION_CHUNK_OVERLAP_TOKENS` - Overlap between split chunks

## Two-Phase Chunking Process

### Phase 1: AST-Based Semantic Extraction

Tree-sitter parses code into semantic units:
- Functions and methods
- Classes and interfaces
- Properties and fields
- Includes preceding comments/docstrings

**Benefits:**
- Maintains semantic boundaries
- Preserves complete code context
- Language-aware parsing
- Natural code structure

### Phase 2: Token-Aware Splitting

Large semantic chunks exceeding `maxChunkTokens` are intelligently split:

1. **Token Counting**: Uses tiktoken (cl100k_base encoding) for accurate counts
2. **Boundary Preservation**: Splits on natural boundaries:
   - Line breaks (preferred)
   - Sentence boundaries
   - Word boundaries (last resort)
3. **Overlap**: Maintains `chunkOverlapTokens` between splits for context
4. **Metadata Preservation**: All chunks retain original file path, language, and line numbers

## Splitting Algorithm

```
For each semantic chunk:
  1. Count tokens in chunk content
  2. If tokens <= maxChunkTokens:
     - Keep chunk as-is
  3. Else:
     - Split by lines (preferred)
     - If line too long, split by sentences
     - If sentence too long, split by words
     - Apply overlap between splits
     - Mark as "chunkType_part_N"
```

## Example

**Input:** Large TypeScript class (1500 tokens)

```typescript
class DataProcessor {
  // 200 lines of code
  processData() {
    // Complex logic...
  }
}
```

**Output:** 3 chunks
- Chunk 1: Lines 1-150 (500 tokens) - `class_part_1`
- Chunk 2: Lines 140-290 (500 tokens) - `class_part_2` (50 token overlap)
- Chunk 3: Lines 280-350 (500 tokens) - `class_part_3` (50 token overlap)

## Benefits

1. **Optimal Embedding Quality**: Chunks sized for model's sweet spot
2. **Semantic Coherence**: AST-based extraction maintains code meaning
3. **Context Preservation**: Overlap ensures continuity across splits
4. **Search Accuracy**: Better vector similarity with properly-sized chunks
5. **Memory Efficiency**: Prevents oversized embeddings

## Implementation

Key files:
- `src/shared/utils/token-counter.ts` - Token counting and splitting logic
- `src/domains/parsing/tree-sitter-parsing.service.ts` - AST parsing and chunk processing
- `src/shared/config/config.ts` - Configuration defaults

## Testing

Tests verify:
- Small chunks remain unsplit
- Large chunks split at token boundaries
- Metadata preserved across splits
- Token limits respected
- Overlap applied correctly

See:
- `src/shared/utils/__tests__/token-counter.test.ts`
- `src/domains/parsing/__tests__/tree-sitter-parsing.service.test.ts`

## Performance Considerations

- Token counting adds ~5-10ms per chunk
- Splitting only occurs for oversized chunks (minority of cases)
- Batch processing maintains overall ingestion speed
- Memory usage remains constant regardless of chunk size

## Future Enhancements

Potential improvements:
- Adaptive chunk sizing based on code complexity
- Language-specific token limits
- Semantic similarity-based splitting
- Custom overlap strategies per language
