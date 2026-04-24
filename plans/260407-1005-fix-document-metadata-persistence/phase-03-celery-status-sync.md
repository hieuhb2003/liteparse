# Phase 03: Celery Task Status Sync

**Priority**: High
**Status**: TODO

## Overview

Update `process_document` Celery task to write status/chunk_count back to Redis store after processing completes or fails.

Currently the task only returns a dict result — the document status in `_documents` was never updated (existing bug). Now with Redis, the task should update status properly.

## Related Code Files

- **Modify:** `src/tasks/document_tasks.py` — add Redis status updates
- **Read:** `src/storage/document-metadata-store.py` — for sync client usage

## Key Insight

Celery tasks run in a **sync** context (worker thread). `DocumentMetadataStore` uses `redis.asyncio`. Two options:
1. Create a sync Redis client in the task (simpler, Celery is sync anyway)
2. Use `asyncio.run_until_complete` on the async store

**Decision:** Option 1 — use sync `redis.Redis` directly in the task. Simpler, no event loop gymnastics. Just 2-3 `hset` calls.

## Implementation Steps

1. In `process_document` task, after successful processing:
   ```python
   from redis import Redis
   from config import get_settings
   
   settings = get_settings()
   r = Redis.from_url(settings.redis_metadata_url, decode_responses=True)
   r.hset(f"doc:{document_id}", mapping={
       "status": "completed",
       "chunk_count": str(len(document.chunks)),
   })
   ```

2. In `except` block (final failure after max retries):
   ```python
   r.hset(f"doc:{document_id}", mapping={
       "status": "failed",
       "error_message": str(exc),
   })
   ```

3. At task start, update status to "processing":
   ```python
   r.hset(f"doc:{document_id}", mapping={"status": "processing"})
   ```

## Success Criteria

- [ ] Task updates Redis on start → `processing`
- [ ] Task updates Redis on success → `completed` + `chunk_count`
- [ ] Task updates Redis on final failure → `failed` + `error_message`
- [ ] Uses sync Redis client (not async) since Celery is sync
