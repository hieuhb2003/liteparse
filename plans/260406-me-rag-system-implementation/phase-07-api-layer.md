# Phase 07: API Layer (FastAPI)

**Priority**: MEDIUM
**Status**: TODO
**Description**: REST API for document CRUD and RAG queries

## Files to Create

- `src/me_rag/api/__init__.py`
- `src/me_rag/api/router.py`
- `src/me_rag/api/documents.py`
- `src/me_rag/api/search.py`
- `src/me_rag/api/dependencies.py`

## Endpoints

### Documents API (`/api/v1/documents`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/documents/upload` | Upload document file, triggers async parsing |
| GET | `/documents` | List documents (paginated) |
| GET | `/documents/{id}` | Get document details |
| DELETE | `/documents/{id}` | Delete document + chunks from vector store |
| GET | `/documents/{id}/status` | Check processing status |
| GET | `/documents/{id}/chunks` | Get document chunks |

### Search/RAG API (`/api/v1`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/search` | Vector search (no LLM) |
| POST | `/rag/query` | Full RAG query with LLM |

### Upload Flow

```
POST /documents/upload (multipart file)
  → Validate file type
  → Save to temp storage
  → Create Document record (status=PENDING)
  → Dispatch Celery task
  → Return Document with task_id
```

### dependencies.py

```python
# FastAPI dependency injection
def get_settings() -> Settings: ...
def get_vector_store() -> BaseVectorStore: ...
def get_embedding() -> BaseEmbedding: ...
def get_llm() -> BaseLLM: ...
def get_ingestion_pipeline() -> IngestionPipeline: ...
def get_rag_pipeline() -> RAGPipeline: ...
```

## Implementation Steps

1. Create `dependencies.py` with DI factories
2. Implement `documents.py` with CRUD endpoints
3. Implement `search.py` with search + RAG endpoints
4. Create `router.py` aggregating all routes
5. Wire into `main.py`

## Success Criteria

- [ ] File upload accepts PDF/DOCX/XLSX/CSV
- [ ] Document CRUD works (list, get, delete)
- [ ] Status endpoint reflects Celery task progress
- [ ] RAG query returns answer with citations
- [ ] OpenAPI docs at `/docs`
