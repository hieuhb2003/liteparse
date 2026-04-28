# Phase 01: Rewrite Dockerfile + Entrypoint + Service Pyproject

## Context Links

- Current files: `examples/docker-parse-service/{Dockerfile,docker-compose.yml,entrypoint.sh,server.py}`
- Reference image: `ocr/paddlex-layout/Dockerfile` (works)
- LiteParse build: `package.json` (`npm run build` → `tsc && copy-vendor`)
- Layout server: `ocr/paddlex-layout/server.py` (port 8830)

## Overview

- **Priority:** P0
- **Status:** completed
- **Description:** Replace 2-stage build with single-stage Dockerfile that installs Node 20 + Python 3.12 + uv, builds liteparse in place via `npm install -g .`, syncs paddlex-layout + parse-service deps into one uv venv, and has a robust entrypoint.

## Key Insights

- `dist/src/index.js` has `#!/usr/bin/env node` shebang → `npm install -g .` will register `lit`/`liteparse` bins correctly.
- `uv sync` in `paddlex-layout` already pulls fastapi/uvicorn/python-multipart (server.py dùng chúng). Parse service chỉ cần thêm các dep này nếu venv riêng. Merge vào cùng venv để không cần `uv add` ở runtime.
- PaddleX models tải về `~/.paddlex/` lần đầu chạy. Cần `HOME=/root` (hoặc writable) và chấp nhận lần đầu chậm.
- `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True` cần set để skip network check khi đã có model cache.

## Requirements

### Functional
- Image build từ context = repo root (giữ nguyên `docker-compose.yml` context `../..`).
- Container expose port 8080 (parse), port 8830 nội bộ (layout).
- `lit --version` runnable trong container.
- `python -c "from paddlex import create_pipeline"` runnable.
- Entrypoint start layout server background → wait healthy → start FastAPI parse server foreground.

### Non-functional
- Build deterministic (pinned versions where reasonable).
- Layer ordering tối ưu cache: deps trước, source sau.
- Image không cần multi-stage; KISS.

## Architecture

```
[python:3.12-slim base]
  ├── apt: curl, libgl1, libglib2.0-0, libgomp1, libreoffice-writer, nodejs (NodeSource 20.x)
  ├── uv (via pip)
  ├── /opt/liteparse  ← npm install -g . (provides `lit` bin)
  ├── /app/paddlex-layout  ← uv sync (paddlex + fastapi + uvicorn + python-multipart)
  ├── /app/service/server.py  ← FastAPI parse gateway (uses same uv venv)
  └── /app/entrypoint.sh
       1. cd /app/paddlex-layout && uv run python server.py & (background)
       2. wait for http://localhost:8830/health (max 600s)
       3. cd /app/service && uv run --project /app/paddlex-layout python server.py
```

## Related Code Files

### Modify
- `examples/docker-parse-service/Dockerfile` — full rewrite
- `examples/docker-parse-service/entrypoint.sh` — increase timeout, clearer logs
- `examples/docker-parse-service/docker-compose.yml` — minor cleanup, keep healthcheck

### Read-only
- `package.json`, `tsconfig.json`, `src/`, `cli/`
- `ocr/paddlex-layout/{pyproject.toml,server.py,my_config/,normalize.py}`
- `examples/docker-parse-service/server.py` (parse gateway, không sửa logic)

### No new files needed
- Parse service share venv với paddlex-layout → không cần pyproject.toml riêng cho `/app/service`.

## Implementation Steps

### 1. Rewrite `examples/docker-parse-service/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
# Build context = repo root
# Build: docker compose -f examples/docker-parse-service/docker-compose.yml build

FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    NODE_VERSION=20 \
    HOME=/root \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

# System deps + Node.js 20 (NodeSource) in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg \
        libgl1 libglib2.0-0 libgomp1 \
        libreoffice-writer \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# uv (Python package manager)
RUN pip install --no-cache-dir uv

# ---- LiteParse: build + install globally ----
WORKDIR /opt/liteparse
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src/ src/
COPY cli/ cli/
RUN npm run build \
 && npm install -g . \
 && lit --help > /dev/null  # smoke test

# ---- PaddleX layout server (Python deps) ----
WORKDIR /app/paddlex-layout
COPY ocr/paddlex-layout/pyproject.toml ocr/paddlex-layout/uv.lock ./
RUN uv sync --frozen
COPY ocr/paddlex-layout/ ./

# ---- Parse service (shares same uv env) ----
WORKDIR /app/service
COPY examples/docker-parse-service/server.py ./

# ---- Entrypoint ----
COPY examples/docker-parse-service/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080
ENV LAYOUT_SERVER_URL=http://localhost:8830/layout \
    LIT_BIN=lit

WORKDIR /app
CMD ["/app/entrypoint.sh"]
```

**Notes on this Dockerfile:**
- `npm ci` runs before `COPY src/ cli/` to leverage layer cache when only source changes.
- `npm install -g .` registers `lit` binary properly via npm machinery (handles shebang/perms).
- `uv sync --frozen` uses lockfile for reproducible builds.
- Parse service's `server.py` chạy bằng `uv run --project /app/paddlex-layout` từ entrypoint → reuse venv, không cần fastapi install riêng.

### 2. Rewrite `examples/docker-parse-service/entrypoint.sh`

```bash
#!/bin/bash
set -euo pipefail

LAYOUT_HEALTH_URL="${LAYOUT_HEALTH_URL:-http://localhost:8830/health}"
LAYOUT_TIMEOUT_SECS="${LAYOUT_TIMEOUT_SECS:-600}"

echo "[entrypoint] Starting PaddleX layout server (background)..."
cd /app/paddlex-layout
uv run python server.py &
LAYOUT_PID=$!

cleanup() {
    echo "[entrypoint] Shutting down layout server (pid=$LAYOUT_PID)..."
    kill "$LAYOUT_PID" 2>/dev/null || true
    wait "$LAYOUT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[entrypoint] Waiting for layout server (max ${LAYOUT_TIMEOUT_SECS}s)..."
deadline=$(( $(date +%s) + LAYOUT_TIMEOUT_SECS ))
while :; do
    if curl -sf "$LAYOUT_HEALTH_URL" > /dev/null 2>&1; then
        echo "[entrypoint] Layout server READY."
        break
    fi
    if ! kill -0 "$LAYOUT_PID" 2>/dev/null; then
        echo "[entrypoint] FATAL: Layout server process died. Check logs above." >&2
        exit 1
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
        echo "[entrypoint] WARNING: Layout server not ready after ${LAYOUT_TIMEOUT_SECS}s. Continuing anyway." >&2
        break
    fi
    sleep 2
done

echo "[entrypoint] Starting FastAPI parse service on :8080 ..."
cd /app/service
exec uv run --project /app/paddlex-layout python server.py
```

**Changes from current:**
- `set -euo pipefail` for strict mode
- Trap to ensure layout server dies with container
- Detect dead layout server (process check)
- 600s timeout (configurable via env)
- `exec` parse service so SIGTERM propagates correctly
- Reuse paddlex-layout venv via `--project` flag

### 3. Update `examples/docker-parse-service/docker-compose.yml`

Mostly unchanged; bump `start_period` to 600s to align with model load time:

```yaml
services:
  parser:
    build:
      context: ../..
      dockerfile: examples/docker-parse-service/Dockerfile
    ports:
      - "8080:8080"
    environment:
      - LAYOUT_SERVER_URL=http://localhost:8830/layout
      - PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
      - LAYOUT_TIMEOUT_SECS=600
    volumes:
      - paddle_models:/root/.paddlex
      - /tmp/liteparse:/tmp/liteparse
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 600s

volumes:
  paddle_models:
```

**Changes:**
- Named volume `paddle_models` mounted at `/root/.paddlex` → cache models across container restarts (avoid re-download).
- `start_period: 600s` to give model load time.
- `LAYOUT_TIMEOUT_SECS` exposed.

### 4. Verify `examples/docker-parse-service/server.py` (no change expected)

Sanity check: it shells out to `LIT_BIN` (= `lit`), reads `LAYOUT_SERVER_URL`. Both env vars set in Dockerfile/compose. No change needed.

## Todo List

- [x] Rewrite `Dockerfile` per spec above
- [x] Rewrite `entrypoint.sh` per spec above
- [x] Update `docker-compose.yml` (named volume, timeouts)
- [x] Verify `server.py` (small fix: join per-page text for non-empty top-level `text`)
- [x] Add `.dockerignore` (extra fix — host `.venv` was clobbering in-image venv)

## Success Criteria

- All four files updated and lint-clean (no shellcheck errors on entrypoint).
- Dockerfile syntax valid (`docker buildx build --check` or trial build start).

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `npm install -g .` fails because `package.json` `files` field excludes built dist | Low | `dist/` is in `files`; npm pack-style install will include it post-build |
| `uv sync --frozen` requires `uv.lock` present | Cert | `uv.lock` exists in `ocr/paddlex-layout/` |
| PaddleX model download fails behind firewall | Med | `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK` set; volume cache; document offline workflow in phase 02 |
| LibreOffice headless first-run creates `~/.config` | Low | `HOME=/root` writable in container |
| Node 20 + Python 3.12 image size > 2GB | Cert | Acceptable; user explicitly deferred optimization |

## Security Considerations

- Container runs as root (default). Acceptable for "make it work" pass; harden later.
- No secrets in image.
- `curl | bash` for NodeSource is standard but pin to specific version if needed later.

## Next Steps

→ Phase 02: build, run, fix any concrete failures.
