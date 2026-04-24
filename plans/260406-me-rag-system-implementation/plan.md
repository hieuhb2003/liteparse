# ME-RAG System Implementation Plan

**Created**: 2026-04-06
**Status**: Planning
**Goal**: Build a modular RAG system with document parsing, embedding, vector search, and API layer

## Summary

Build a production-ready RAG (Retrieval-Augmented Generation) system in Python with:
- Document parsing (PDF/DOCX via LiteParse, Excel/CSV via custom code)
- Pydantic models for all data contracts
- OpenAI-compatible embedding & LLM services
- Qdrant vector database
- FastAPI REST API for document CRUD
- Celery async task processing
- Docker Compose for all services

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Docker & Infrastructure | `TODO` | [phase-01](phase-01-docker-infrastructure.md) |
| 2 | Core Models & Schemas | `TODO` | [phase-02](phase-02-core-models-schemas.md) |
| 3 | Document Parser Module | `TODO` | [phase-03](phase-03-document-parser.md) |
| 4 | Embedding & LLM Service | `TODO` | [phase-04](phase-04-embedding-llm-service.md) |
| 5 | Vector Store (Qdrant) | `TODO` | [phase-05](phase-05-vector-store.md) |
| 6 | RAG Pipeline | `TODO` | [phase-06](phase-06-rag-pipeline.md) |
| 7 | API Layer (FastAPI) | `TODO` | [phase-07](phase-07-api-layer.md) |
| 8 | Celery Task Workers | `TODO` | [phase-08](phase-08-celery-tasks.md) |

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   FastAPI     │────▶│   Celery     │────▶│   Parser     │
│   (Router)    │     │   (Worker)   │     │  (LiteParse) │
└──────┬───────┘     └──────┬───────┘     └──────────────┘
       │                    │
       │              ┌─────▼──────┐
       │              │  Embedding  │
       │              │  Service    │
       │              └─────┬──────┘
       │                    │
       ▼                    ▼
┌──────────────┐     ┌──────────────┐
│   Redis      │     │   Qdrant     │
│   (Broker)   │     │   (Vector)   │
└──────────────┘     └──────────────┘
```

## Tech Stack

- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Models**: Pydantic v2
- **Parser**: LiteParse (Node.js CLI via Python wrapper)
- **Vector DB**: Qdrant
- **Embedding/LLM**: OpenAI API (or compatible)
- **Task Queue**: Celery + Redis
- **Container**: Docker + Docker Compose

## Directory Structure

```
me-rag/
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
├── .env.example
├── src/
│   └── me_rag/
│       ├── __init__.py
│       ├── main.py                    # FastAPI app entry
│       ├── config.py                  # Settings via pydantic-settings
│       ├── models/
│       │   ├── __init__.py
│       │   ├── document.py            # Document, DocumentMeta, DocumentChunk
│       │   ├── retrieval.py           # RetrievalQuery, RetrievalResult, Citation
│       │   ├── rag.py                 # RAGRequest, RAGResponse, RAGConfig
│       │   └── common.py             # Shared types, enums, base models
│       ├── parsers/
│       │   ├── __init__.py
│       │   ├── base.py                # Abstract BaseParser
│       │   ├── liteparse-parser.py    # PDF/DOCX via LiteParse
│       │   ├── excel-parser.py        # XLSX/CSV custom parser
│       │   └── registry.py            # Parser registry by file type
│       ├── embedding/
│       │   ├── __init__.py
│       │   ├── base.py                # Abstract BaseEmbedding
│       │   └── openai-embedding.py    # OpenAI embedding impl
│       ├── llm/
│       │   ├── __init__.py
│       │   ├── base.py                # Abstract BaseLLM
│       │   └── openai-llm.py          # OpenAI LLM impl
│       ├── vectorstore/
│       │   ├── __init__.py
│       │   ├── base.py                # Abstract BaseVectorStore
│       │   └── qdrant-store.py        # Qdrant implementation
│       ├── pipeline/
│       │   ├── __init__.py
│       │   ├── chunker.py             # Text chunking strategies
│       │   ├── ingestion.py           # Document ingestion pipeline
│       │   └── retrieval.py           # RAG retrieval + generation
│       ├── api/
│       │   ├── __init__.py
│       │   ├── router.py              # Main API router
│       │   ├── documents.py           # Document CRUD endpoints
│       │   ├── search.py              # Search/RAG endpoints
│       │   └── dependencies.py        # FastAPI dependencies
│       └── tasks/
│           ├── __init__.py
│           ├── celery-app.py          # Celery app config
│           ├── document-tasks.py      # Parse & ingest tasks
│           └── maintenance-tasks.py   # Cleanup, re-index tasks
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_parsers/
│   ├── test_models/
│   ├── test_api/
│   └── test_pipeline/
├── plans/
└── docs/
```

## Key Dependencies

- `fastapi`, `uvicorn`
- `pydantic`, `pydantic-settings`
- `celery[redis]`
- `qdrant-client`
- `openai`
- `liteparse` (Python wrapper)
- `openpyxl`, `pandas` (Excel parsing)
- `python-multipart` (file uploads)
