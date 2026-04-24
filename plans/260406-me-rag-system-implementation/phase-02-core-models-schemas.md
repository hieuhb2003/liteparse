# Phase 02: Core Models & Schemas

**Priority**: HIGH
**Status**: TODO
**Description**: Define all Pydantic v2 models for the entire system

## Overview

Create all data contracts as Pydantic models. These are the backbone of the system - every module depends on them.

## Files to Create

- `src/me_rag/models/__init__.py`
- `src/me_rag/models/common.py`
- `src/me_rag/models/document.py`
- `src/me_rag/models/retrieval.py`
- `src/me_rag/models/rag.py`

## Model Definitions

### common.py - Shared Types

```python
class FileType(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    DOC = "doc"
    XLSX = "xlsx"
    CSV = "csv"

class ProcessingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class BaseModel(PydanticBaseModel):
    """Base model with common config"""
    model_config = ConfigDict(from_attributes=True)

class TimestampMixin(BaseModel):
    created_at: datetime
    updated_at: datetime | None = None
```

### document.py - Document Models

```python
class DocumentMeta(BaseModel):
    """Metadata extracted from document"""
    filename: str
    file_type: FileType
    file_size: int                    # bytes
    page_count: int | None = None
    title: str | None = None
    author: str | None = None
    source: str | None = None         # URL or path
    custom_metadata: dict[str, Any] = {}

class DocumentChunk(BaseModel):
    """A chunk of text from a document"""
    chunk_id: str                     # uuid
    document_id: str
    content: str
    chunk_index: int                  # position in document
    page_number: int | None = None
    token_count: int | None = None
    embedding: list[float] | None = None
    metadata: dict[str, Any] = {}

class Document(TimestampMixin):
    """Top-level document record"""
    id: str                           # uuid
    meta: DocumentMeta
    status: ProcessingStatus = ProcessingStatus.PENDING
    chunks: list[DocumentChunk] = []
    error_message: str | None = None
    task_id: str | None = None        # Celery task ID

class DocumentUploadRequest(BaseModel):
    """API request for uploading a document"""
    source: str | None = None
    custom_metadata: dict[str, Any] = {}

class DocumentResponse(BaseModel):
    """API response for document"""
    id: str
    meta: DocumentMeta
    status: ProcessingStatus
    chunk_count: int
    error_message: str | None = None
    created_at: datetime

class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int
    page: int
    page_size: int
```

### retrieval.py - Retrieval Models

```python
class RetrievalQuery(BaseModel):
    """Query for vector search"""
    query: str
    top_k: int = 5
    score_threshold: float = 0.0
    filter_metadata: dict[str, Any] = {}
    document_ids: list[str] | None = None  # filter by docs

class ScoredChunk(BaseModel):
    """A chunk with relevance score"""
    chunk: DocumentChunk
    score: float
    document_meta: DocumentMeta | None = None

class RetrievalResult(BaseModel):
    """Result of vector search"""
    query: str
    chunks: list[ScoredChunk]
    total_found: int

class Citation(BaseModel):
    """Citation pointing to source"""
    document_id: str
    chunk_id: str
    filename: str
    page_number: int | None = None
    content_snippet: str              # relevant excerpt
    score: float
```

### rag.py - RAG Models

```python
class RAGConfig(BaseModel):
    """Configuration for RAG pipeline"""
    top_k: int = 5
    score_threshold: float = 0.0
    max_context_tokens: int = 4000
    system_prompt: str | None = None
    temperature: float = 0.7
    include_citations: bool = True

class RAGRequest(BaseModel):
    """API request for RAG query"""
    query: str
    config: RAGConfig = RAGConfig()
    document_ids: list[str] | None = None
    conversation_history: list[dict[str, str]] = []

class RAGResponse(BaseModel):
    """API response for RAG query"""
    answer: str
    citations: list[Citation]
    retrieval_result: RetrievalResult | None = None
    model: str
    usage: dict[str, int] = {}        # token usage
```

## Implementation Steps

1. Create `common.py` with enums, base model, timestamp mixin
2. Create `document.py` with all document-related models
3. Create `retrieval.py` with search/retrieval models
4. Create `rag.py` with RAG pipeline models
5. Export all from `__init__.py`
6. Run type check to verify

## Success Criteria

- [ ] All models importable from `me_rag.models`
- [ ] Models serialize/deserialize correctly
- [ ] Validation works (e.g., FileType enum rejects invalid values)
