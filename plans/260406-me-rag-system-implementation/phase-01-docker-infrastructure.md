# Phase 01: Docker & Infrastructure

**Priority**: HIGH
**Status**: TODO
**Description**: Set up Docker, Docker Compose, and project scaffolding

## Overview

Create the foundational infrastructure: Dockerfile, docker-compose.yml with all services (FastAPI, Qdrant, Redis, Celery worker), and Python project structure with pyproject.toml.

## Requirements

### Functional
- Docker Compose orchestrates all services
- FastAPI app starts and serves health endpoint
- Qdrant accessible on default port
- Redis accessible as Celery broker
- Celery worker connects to Redis

### Non-functional
- Hot-reload for development (volume mount + uvicorn --reload)
- Environment variables via .env file
- Services restart on failure

## Architecture

```
docker-compose.yml
├── app (FastAPI + uvicorn)        :8000
├── worker (Celery)                
├── redis                          :6379
├── qdrant                         :6333
└── node (LiteParse CLI)           # sidecar or installed in app image
```

## Files to Create

- `docker-compose.yml`
- `Dockerfile`
- `.env.example`
- `pyproject.toml`
- `src/me_rag/__init__.py`
- `src/me_rag/main.py` (minimal FastAPI app with health check)
- `src/me_rag/config.py` (pydantic-settings)

## Implementation Steps

1. Create `pyproject.toml` with all dependencies
2. Create `Dockerfile` - Python 3.11 + Node.js 18 (for LiteParse)
3. Create `docker-compose.yml` with services: app, worker, redis, qdrant
4. Create `.env.example` with all config vars
5. Create `src/me_rag/config.py` using pydantic-settings `BaseSettings`
6. Create `src/me_rag/main.py` with FastAPI app + `/health` endpoint
7. Verify `docker compose up` starts all services

## Docker Compose Services

```yaml
services:
  app:        # FastAPI, port 8000, depends on redis + qdrant
  worker:     # Celery worker, same image, different command
  redis:      # redis:7-alpine, port 6379
  qdrant:     # qdrant/qdrant:latest, port 6333
```

## Config Variables (.env)

```
# App
APP_HOST=0.0.0.0
APP_PORT=8000
APP_DEBUG=true

# OpenAI
OPENAI_API_KEY=
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_LLM_MODEL=gpt-4o-mini

# Qdrant
QDRANT_HOST=qdrant
QDRANT_PORT=6333
QDRANT_COLLECTION=documents

# Redis
REDIS_URL=redis://redis:6379/0

# Celery
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1
```

## Success Criteria

- [ ] `docker compose up` starts all 4 services
- [ ] `GET /health` returns 200
- [ ] Qdrant dashboard accessible at :6333
- [ ] Celery worker connects to Redis broker
