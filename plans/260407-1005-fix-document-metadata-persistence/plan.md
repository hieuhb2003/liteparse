# Fix Document Metadata Persistence

**Created**: 2026-04-07
**Status**: Ready
**Priority**: High
**Mode**: Fast

## Problem

`src/api/documents.py` uses `_documents: dict` (in-memory) to store document metadata.

**Bugs:**
1. Server restart → dict lost → GET/DELETE return 404, but chunks remain orphaned in Qdrant
2. Long-running server → dict grows unbounded, never GC'd

## Solution

Replace in-memory dict with **Redis hashes**. Redis already in stack (Celery broker), `redis-py` already installed via `celery[redis]`.

Use Redis DB 2 (`redis://redis:6379/2`) to avoid collision with Celery broker (DB 0) and result backend (DB 1).

## Architecture

```
documents.py → DocumentMetadataStore (Redis) → Redis DB 2
                    ↕
              Qdrant (chunks)
```

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Create Redis document metadata store | `TODO` | [phase-01](phase-01-redis-document-store.md) |
| 2 | Update documents API to use store | `TODO` | [phase-02-update-documents-api.md](phase-02-update-documents-api.md) |
| 3 | Update Celery task to sync status | `TODO` | [phase-03-celery-status-sync.md](phase-03-celery-status-sync.md) |

## Key Decisions

- Redis over SQLite: already in stack, no new infra
- Separate DB number (2): isolate from Celery data
- Async via `redis.asyncio`: FastAPI is async
- Store as Redis hashes: `doc:{doc_id}` → fields map naturally
