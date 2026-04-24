# Phase 08: Celery Task Workers

**Priority**: MEDIUM
**Status**: TODO
**Description**: Async task processing for document parsing and ingestion

## Files to Create

- `src/me_rag/tasks/__init__.py`
- `src/me_rag/tasks/celery-app.py`
- `src/me_rag/tasks/document-tasks.py`
- `src/me_rag/tasks/maintenance-tasks.py`

## Architecture

### celery-app.py

```python
from celery import Celery
from me_rag.config import get_settings

settings = get_settings()
celery_app = Celery("me_rag", broker=settings.celery_broker_url)
celery_app.conf.result_backend = settings.celery_result_backend
```

### document-tasks.py

```python
@celery_app.task(bind=True, max_retries=3)
def process_document(self, document_id: str, file_path: str, file_type: str):
    """
    1. Update status → PROCESSING
    2. Run ingestion pipeline (parse → chunk → embed → store)
    3. Update status → COMPLETED
    4. On error: Update status → FAILED with error message
    """
```

### maintenance-tasks.py

```python
@celery_app.task
def cleanup_temp_files():
    """Periodic: remove old temp upload files"""

@celery_app.task
def reindex_document(document_id: str):
    """Re-parse and re-embed a document"""
```

## Docker Compose Worker

```yaml
worker:
  build: .
  command: celery -A me_rag.tasks.celery_app worker --loglevel=info
  depends_on:
    - redis
    - qdrant
  env_file: .env
```

## Implementation Steps

1. Create `celery-app.py` with Celery configuration
2. Implement `document-tasks.py` with process_document task
3. Implement `maintenance-tasks.py` with cleanup + reindex
4. Wire document upload API to dispatch Celery task
5. Add status polling endpoint
6. Test full flow: upload → task → parse → embed → store

## Success Criteria

- [ ] Celery worker starts and connects to Redis
- [ ] Document upload dispatches async task
- [ ] Task processes document through full pipeline
- [ ] Status updates reflect task progress
- [ ] Failed tasks set FAILED status with error message
- [ ] Retry logic works on transient failures
