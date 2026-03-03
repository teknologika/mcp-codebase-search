# Search Ranking Boost Implementation

## Problem
When searching for "LapCollector", the file `LapCollector.cs` containing the `LapCollector` class was not appearing in top results. The search relied purely on semantic similarity from embeddings, which didn't prioritize exact filename or symbol name matches.

## Solution
Added filename and symbol name boosting to the search ranking algorithm in `SearchService`.

## Implementation Details

### New Method: `applyNameBoost()`
Location: `src/domains/search/search.service.ts`

The method applies score boosts when query terms match:
1. **Filename matches** (without extension)
   - Exact match: +0.25 boost
   - Partial match: +0.15 boost

2. **Symbol name matches** (class, function, interface, enum, method names)
   - Exact match: +0.20 boost
   - Partial match: +0.10 boost

3. **Boost capping**: Maximum total boost of 0.35 to prevent over-boosting

### Boost Formula
```
boosted_score = base_score + (boost * (1 - base_score))
```

This ensures:
- Scores stay in [0, 1] range
- Scores never exceed 1.0
- Higher base scores get smaller absolute boosts (proportional boosting)

### Integration
The boost is applied in the search loop after calculating the base similarity score from vector distance, before creating the SearchResult object.

## Example Impact

**Before**: Searching "LapCollector" → LapCollector.cs at position 10+

**After**: Searching "LapCollector" → LapCollector.cs should rank in top 3 due to:
- Filename "LapCollector.cs" matches query term "LapCollector" (exact match: +0.25)
- Class name "LapCollector" in content matches query term (exact match: +0.20)
- Total boost: +0.35 (capped)

## Testing
Build completed successfully with no TypeScript errors.

## Next Steps
1. Restart MCP server to deploy changes
2. Test search for "LapCollector" to verify ranking improvement
3. Test other queries to ensure no regression
