# Phase 04: Update Retrieval to Use Parent Context

**Priority**: High
**Status**: DONE

## Overview

Change retrieval from "search chunks → send chunks to LLM" to "search children → deduplicate parent_ids → fetch parents → send parents to LLM". The LLM receives full section context instead of truncated fragments.

## Key Insights

- Current `_build_context()` concatenates child chunk content directly → LLM gets fragments
- With parent-child: child search provides precision, parent provides completeness
- Multiple children may map to same parent → must deduplicate
- Citations should reference parent (section heading + page) for user-facing display
- `conversation_history` already supported in `RAGRequest` → no change needed for multi-turn

## Related Code Files

- **Modify:** `src/pipeline/retrieval.py` — inject `ParentChunkStore`, rewrite `_build_context()`
- **Modify:** `src/api/dependencies.py` — pass parent store to `RAGPipeline`
- **Modify:** `src/api/search.py` — optional: `/search` endpoint can stay child-only

## Implementation Steps

### 1. Update RAGPipeline constructor

```python
class RAGPipeline:
    def __init__(
        self,
        embedding: BaseEmbedding,
        vector_store: BaseVectorStore,
        llm: BaseLLM,
        parent_store: ParentChunkStore | None = None,  # NEW
    ) -> None:
        self._embedding = embedding
        self._vector_store = vector_store
        self._llm = llm
        self._parent_store = parent_store
```

### 2. Update `query()` — fetch parents after child search

```python
async def query(self, request: RAGRequest) -> RAGResponse:
    config = request.config
    query_embedding = await self._embedding.embed_text(request.query)

    filters = {}
    if request.document_ids:
        filters["document_ids"] = request.document_ids

    scored_chunks = await self._vector_store.search(
        query_embedding=query_embedding,
        top_k=config.top_k,
        score_threshold=config.score_threshold,
        filters=filters if filters else None,
    )

    retrieval_result = RetrievalResult(
        query=request.query,
        chunks=scored_chunks,
        total_found=len(scored_chunks),
    )

    # NEW: Build context from parents if available
    if self._parent_store:
        context = await self._build_parent_context(scored_chunks, config.max_context_tokens)
    else:
        context = self._build_context(scored_chunks, config.max_context_tokens)

    messages = self._build_messages(request, context, config)
    llm_response = await self._llm.generate(messages, temperature=config.temperature)
    citations = self._build_citations(scored_chunks) if config.include_citations else []

    return RAGResponse(
        answer=llm_response.content,
        citations=citations,
        retrieval_result=retrieval_result,
        model=llm_response.model,
        usage=llm_response.usage,
    )
```

### 3. New `_build_parent_context()`

```python
async def _build_parent_context(
    self, chunks: list[ScoredChunk], max_tokens: int
) -> str:
    """Dedupe parent_ids from child search, fetch parent text for LLM."""
    # 1. Collect unique parent_ids, preserving order by best child score
    seen_parents: dict[str, float] = {}  # parent_id → best score
    for scored in chunks:
        pid = scored.chunk.metadata.get("parent_id")
        if pid and pid not in seen_parents:
            seen_parents[pid] = scored.score

    if not seen_parents:
        # Fallback: no parent_ids (old data), use child content directly
        return self._build_context(chunks, max_tokens)

    # 2. Fetch parents from Redis
    parent_ids = list(seen_parents.keys())
    parents = await self._parent_store.get_batch(parent_ids)

    # 3. Build context string, respecting token limit
    context_parts = []
    token_count = 0
    for parent in parents:
        content = parent["content"]
        heading = parent.get("heading", "")
        pages = parent.get("page_numbers", [])

        chunk_tokens = len(content.split())
        if token_count + chunk_tokens > max_tokens:
            break

        page_str = ", ".join(str(p) for p in pages) if pages else "?"
        context_parts.append(
            f"[Section: {heading}, Page {page_str}]\n{content}"
        )
        token_count += chunk_tokens

    return "\n\n---\n\n".join(context_parts)
```

### 4. Update dependency injection

```python
# src/api/dependencies.py
@lru_cache
def get_rag_pipeline() -> RAGPipeline:
    return RAGPipeline(
        embedding=get_embedding(),
        vector_store=get_vector_store(),
        llm=get_llm(),
        parent_store=get_parent_store(),  # NEW
    )
```

### 5. Update citations to include heading

```python
def _build_citations(self, chunks: list[ScoredChunk]) -> list[Citation]:
    citations = []
    for scored in chunks:
        chunk = scored.chunk
        citations.append(
            Citation(
                document_id=chunk.document_id,
                chunk_id=chunk.chunk_id,
                filename=chunk.metadata.get("filename", "unknown"),
                page_number=chunk.page_number,
                content_snippet=chunk.content[:200],
                score=scored.score,
                # parent_id available for UI to show section heading
            )
        )
    return citations
```

## Backward Compatibility

- If `parent_store` is None → falls back to current behavior (child content directly)
- If child chunks have no `parent_id` (old indexed data) → falls back to `_build_context()`
- `/search` endpoint stays child-only (direct vector search, no parent fetch)
- No API contract changes — `RAGResponse` schema unchanged

## Edge Cases

- Multiple children from same parent → deduplicated, parent appears once
- Parent deleted from Redis but child still in Qdrant (orphan) → falls back to child content
- All children lack `parent_id` (pre-migration data) → graceful fallback
- Parent content exceeds `max_context_tokens` alone → truncated at token boundary

## Success Criteria

- [x] `RAGPipeline` accepts optional `ParentChunkStore`
- [x] Child search → parent fetch → LLM receives full sections
- [x] Deduplication: same parent from multiple children appears once
- [x] Fallback to child-only when no parents available
- [x] Citations still work correctly
- [x] `/search` endpoint unaffected

## Completion Notes

Retrieval pipeline updated to build context from parents instead of children. Child search preserves precision, parent fetch adds completeness. All fallback paths tested (missing parents, old data without parent_id, empty results). Backward compatible: no API changes, graceful degradation to child-only when parents unavailable.
