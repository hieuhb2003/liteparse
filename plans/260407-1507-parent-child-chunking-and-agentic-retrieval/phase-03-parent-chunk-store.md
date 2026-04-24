# Phase 03: Parent Chunk Redis Store

**Priority**: High
**Status**: DONE

## Overview

Store parent chunks in Redis (DB 3) so retrieval can fetch full section context after child search.

## Key Insights

- Parent chunks are text-only (no embeddings) → Redis hash is ideal
- Separate DB 3 from metadata (DB 2), Celery broker (DB 0), result backend (DB 1)
- Pattern mirrors existing `DocumentMetadataStore` — async Redis client
- Parent chunks must be deleted when document is deleted

## Related Code Files

- **New:** `src/storage/parent_chunk_store.py`
- **Modify:** `src/config.py` — add `redis_parent_store_url`
- **Modify:** `src/api/dependencies.py` — add `get_parent_store()`
- **Modify:** `src/api/documents.py` — delete parents on document delete
- **Modify:** `src/tasks/document_tasks.py` — pass parent store to pipeline

## Implementation Steps

### 1. Config

```python
# src/config.py
redis_parent_store_url: str = "redis://redis:6379/3"
```

### 2. ParentChunkStore

```python
# src/storage/parent_chunk_store.py
"""Redis-backed store for parent chunks (DB 3).

Keys: parent:{document_id}:{index} → Redis hash {content, heading, page_numbers}
Also maintains a set per document: parent_index:{document_id} → set of parent keys
for efficient bulk delete.
"""

class ParentChunkStore:
    _KEY_PREFIX = "parent:"
    _INDEX_PREFIX = "parent_index:"

    def __init__(self, settings: Settings) -> None:
        self._redis = Redis.from_url(
            settings.redis_parent_store_url, decode_responses=True
        )

    async def save_batch(
        self, document_id: str, parents: list[ParentChunk]
    ) -> None:
        """Save all parent chunks for a document."""
        pipe = self._redis.pipeline()
        index_key = f"{self._INDEX_PREFIX}{document_id}"
        for parent in parents:
            key = f"{self._KEY_PREFIX}{parent.id}"
            pipe.hset(key, mapping={
                "content": parent.content,
                "heading": parent.heading,
                "page_numbers": json.dumps(parent.page_numbers),
            })
            pipe.sadd(index_key, key)
        await pipe.execute()

    async def get(self, parent_id: str) -> dict | None:
        """Fetch a single parent chunk by ID."""
        raw = await self._redis.hgetall(f"{self._KEY_PREFIX}{parent_id}")
        if not raw:
            return None
        raw["page_numbers"] = json.loads(raw.get("page_numbers", "[]"))
        return raw

    async def get_batch(self, parent_ids: list[str]) -> list[dict]:
        """Fetch multiple parent chunks by IDs."""
        pipe = self._redis.pipeline()
        for pid in parent_ids:
            pipe.hgetall(f"{self._KEY_PREFIX}{pid}")
        results = await pipe.execute()
        parents = []
        for raw in results:
            if raw:
                raw["page_numbers"] = json.loads(raw.get("page_numbers", "[]"))
                parents.append(raw)
        return parents

    async def delete_by_document(self, document_id: str) -> int:
        """Delete all parent chunks for a document."""
        index_key = f"{self._INDEX_PREFIX}{document_id}"
        keys = await self._redis.smembers(index_key)
        if not keys:
            return 0
        pipe = self._redis.pipeline()
        for key in keys:
            pipe.delete(key)
        pipe.delete(index_key)
        await pipe.execute()
        return len(keys)
```

### 3. Dependency injection

```python
# src/api/dependencies.py
from storage.parent_chunk_store import ParentChunkStore

@lru_cache
def get_parent_store() -> ParentChunkStore:
    return ParentChunkStore(get_settings())
```

### 4. Document delete cleanup

```python
# src/api/documents.py — delete_document()
async def delete_document(document_id: str):
    store = get_document_store()
    doc = await store.get(document_id)

    vector_store = get_vector_store()
    await vector_store.delete_by_document(document_id)

    parent_store = get_parent_store()
    await parent_store.delete_by_document(document_id)  # NEW

    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    await store.delete(document_id)
    return {"message": "Document deleted", "id": document_id}
```

## Edge Cases

- Document with 0 parents (empty PDF) → no Redis keys created, delete is no-op
- Redis connection failure during save → pipeline raises, Celery task retries
- Orphaned parent keys (document metadata deleted but parents remain) → `delete_by_document` cleans via index set

## Success Criteria

- [x] `ParentChunkStore` with `save_batch`, `get`, `get_batch`, `delete_by_document`
- [x] Redis DB 3 configured in `config.py`
- [x] Document delete also deletes parent chunks
- [x] Pipeline integration tested (save parents during ingestion)

## Completion Notes

Redis parent store implemented with code review fix:
- `get_batch()` now stores `parent_id` in hash for reliable retrieval
- Parent save wrapped in try/except for graceful degradation if Redis unavailable
- All cleanup paths tested (document delete cascades to parent deletion)
