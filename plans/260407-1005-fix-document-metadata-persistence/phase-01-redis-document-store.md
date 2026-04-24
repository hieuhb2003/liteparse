# Phase 01: Redis Document Metadata Store

**Priority**: High
**Status**: TODO

## Overview

Create `src/storage/document-metadata-store.py` — async Redis-backed store for document metadata, replacing the in-memory `_documents` dict.

## Key Insights

- `redis-py` (installed via `celery[redis]`) includes `redis.asyncio` for async support
- Document metadata is simple flat data — Redis hashes are ideal
- Need TTL or explicit cleanup? No — delete when document deleted. Matches current behavior.

## Requirements

**Functional:**
- Save document metadata (id, filename, file_type, file_size, status, task_id, chunk_count, error_message, created_at)
- Get by document ID
- List all with pagination
- Delete by document ID
- Update fields (status, chunk_count, error_message)

**Non-functional:**
- Async (FastAPI + Celery task both need access)
- Serialization: JSON in Redis hash values
- Connection pooling via `redis.asyncio.Redis`

## Related Code Files

- **Create:** `src/storage/document-metadata-store.py`
- **Modify:** `src/config.py` — add `redis_metadata_url` setting
- **Modify:** `src/api/dependencies.py` — add `get_document_store()` factory

## Implementation Steps

1. Add `redis_metadata_url` to `Settings` in `config.py`:
   ```python
   redis_metadata_url: str = "redis://redis:6379/2"
   ```

2. Create `src/storage/document-metadata-store.py`:
   ```python
   import json
   from datetime import datetime, timezone
   from redis.asyncio import Redis
   from config import Settings

   KEY_PREFIX = "doc:"

   class DocumentMetadataStore:
       def __init__(self, settings: Settings):
           self._redis = Redis.from_url(settings.redis_metadata_url, decode_responses=True)

       async def save(self, doc_id: str, data: dict) -> None:
           # Serialize datetime/enum fields to strings
           serialized = {k: _serialize(v) for k, v in data.items()}
           await self._redis.hset(f"{KEY_PREFIX}{doc_id}", mapping=serialized)

       async def get(self, doc_id: str) -> dict | None:
           data = await self._redis.hgetall(f"{KEY_PREFIX}{doc_id}")
           return _deserialize(data) if data else None

       async def list_all(self, page: int, page_size: int) -> tuple[list[dict], int]:
           # SCAN for doc:* keys, paginate in Python
           keys = []
           async for key in self._redis.scan_iter(f"{KEY_PREFIX}*"):
               keys.append(key)
           total = len(keys)
           start = (page - 1) * page_size
           page_keys = sorted(keys)[start:start + page_size]
           docs = []
           for key in page_keys:
               data = await self._redis.hgetall(key)
               if data:
                   docs.append(_deserialize(data))
           return docs, total

       async def update(self, doc_id: str, fields: dict) -> None:
           serialized = {k: _serialize(v) for k, v in fields.items()}
           await self._redis.hset(f"{KEY_PREFIX}{doc_id}", mapping=serialized)

       async def delete(self, doc_id: str) -> bool:
           return await self._redis.delete(f"{KEY_PREFIX}{doc_id}") > 0

       async def exists(self, doc_id: str) -> bool:
           return await self._redis.exists(f"{KEY_PREFIX}{doc_id}") > 0
   ```

3. Add helper serialize/deserialize functions in same file for datetime and enum handling.

4. Add `get_document_store()` to `src/api/dependencies.py`:
   ```python
   @lru_cache
   def get_document_store() -> DocumentMetadataStore:
       return DocumentMetadataStore(get_settings())
   ```

## Success Criteria

- [ ] `DocumentMetadataStore` class with save/get/list/update/delete/exists methods
- [ ] Config has `redis_metadata_url` pointing to DB 2
- [ ] Dependency factory in `dependencies.py`
- [ ] All methods are async
