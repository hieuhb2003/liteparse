# Phase 01: Restructure Ingestion Pipeline

**Priority**: High
**Status**: DONE

## Overview

Change ingestion from "batch → chunk → embed per batch" to "batch → collect text → concat → chunk full doc". This ensures section boundaries are never cut by page batches.

## Key Insights

- Current `_ingest_batched()` calls `_process_parsed_result()` per batch which chunks + embeds immediately
- Section headings spanning page boundaries get split into separate batches
- Fix: separate "parse" from "chunk+embed". Parse in batches (memory-safe), but chunk on full text.

## Related Code Files

- **Modify:** `src/pipeline/ingestion.py`
- **Read:** `src/parsers/liteparse_parser.py` (parse interface unchanged)

## Implementation Steps

### 1. Refactor `_ingest_batched()` to collect text only

```python
async def _ingest_batched(self, ...) -> Document:
    all_pages: list[PageContent] = []
    full_text_parts: list[str] = []

    for batch_start in range(1, page_count + 1, self._page_batch_size):
        batch_end = min(batch_start + self._page_batch_size - 1, page_count)
        target_pages = f"{batch_start}-{batch_end}"

        logger.info("Document %s: parsing pages %s/%d", document_id, target_pages, page_count)

        parse_result = await parser.parse(file_path, target_pages=target_pages)
        all_pages.extend(parse_result.pages)
        full_text_parts.append(parse_result.text)

    # Concat full document text
    full_text = "\n\n".join(full_text_parts)

    # Chunk + embed on full document (delegates to phase 02 chunker)
    all_chunks = await self._process_full_document(
        document_id, full_text, all_pages, filename=meta.filename,
    )
    return self._build_document(document_id, meta, all_chunks, page_count)
```

### 2. Create `_process_full_document()` method

Replaces the per-batch `_process_parsed_result()` for batched flow:

```python
async def _process_full_document(
    self,
    document_id: str,
    full_text: str,
    pages: list[PageContent],
    filename: str = "",
) -> list[DocumentChunk]:
    """Chunk and embed full document text (after batch collection)."""
    # Parent-child split (phase 02)
    parent_chunks, child_chunks = self._chunker.split(full_text)

    # Store parents in Redis (phase 03)
    # ...

    # Embed + upsert children to Qdrant
    if not child_chunks:
        return []

    embeddings = await self._embedding.embed_batch(
        [c.content for c in child_chunks]
    )
    # ... build DocumentChunk objects with parent_id, embed, upsert
```

### 3. Keep `_ingest_full()` aligned

For small/non-PDF files, same flow but without batch parsing:

```python
async def _ingest_full(self, ...) -> Document:
    parse_result = await parser.parse(file_path)
    all_chunks = await self._process_full_document(
        document_id, parse_result.text, parse_result.pages, filename=meta.filename,
    )
    page_count = len(parse_result.pages) or None
    return self._build_document(document_id, meta, all_chunks, page_count)
```

## Edge Cases

- Empty batches (pages with only images, no text) → `full_text_parts` may have empty strings → `"\n\n".join()` handles fine
- Single page documents → no batching, goes through `_ingest_full()` path
- Very large documents (500+ pages) → text collection may use significant memory, but less than holding all embeddings. Acceptable trade-off.

## Success Criteria

- [x] Batched parsing collects text without chunking/embedding per batch
- [x] Full document text is concatenated before chunking
- [x] Section headings spanning page boundaries are preserved intact
- [x] Small/non-PDF files still work through `_ingest_full()`
- [x] `_process_parsed_result()` removed or kept only for backward compat

## Completion Notes

All 48 tests pass. Batched ingestion correctly collects page text, concatenates full document, then delegates to parent-child chunker. No per-batch chunking interference with section boundaries.
