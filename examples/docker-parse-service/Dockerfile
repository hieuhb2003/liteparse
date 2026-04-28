# syntax=docker/dockerfile:1
# Build context = repo root
# Build: docker compose -f examples/docker-parse-service/docker-compose.yml build
#
# Single-stage image bundling:
#   - LiteParse CLI (`lit`) installed globally via npm
#   - PaddleX layout server (port 8830, internal)
#   - FastAPI parse gateway (port 8080, exposed)
# Both Python services share one uv-managed venv at /app/paddlex-layout/.venv

FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    NODE_VERSION=20 \
    HOME=/root \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

# System deps + Node.js 20 (NodeSource) in one apt invocation.
# libgl1/libglib2.0-0/libgomp1: PaddlePaddle runtime requirements.
# libreoffice-writer: for liteparse to convert .docx/.odt to PDF.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg \
        libgl1 libglib2.0-0 libgomp1 \
        libreoffice-writer \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# uv: fast Python package manager
RUN pip install --no-cache-dir uv

# ---- LiteParse: build + install globally ----
# Order maximizes cache: deps first (rarely change), then sources.
WORKDIR /opt/liteparse
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src/ src/
COPY cli/ cli/
RUN npm run build \
 && npm install -g . \
 && lit --help > /dev/null

# ---- PaddleX layout server: install Python deps via uv ----
# Lockfile-first for cache; sources copied after.
WORKDIR /app/paddlex-layout
COPY ocr/paddlex-layout/pyproject.toml ocr/paddlex-layout/uv.lock ./
RUN uv sync --frozen
COPY ocr/paddlex-layout/ ./

# ---- Parse service: shares the paddlex-layout uv venv ----
WORKDIR /app/service
COPY examples/docker-parse-service/server.py ./

# ---- Entrypoint ----
COPY examples/docker-parse-service/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080
ENV LAYOUT_SERVER_URL=http://localhost:8830/layout \
    LIT_BIN=lit \
    LAYOUT_TIMEOUT_SECS=600

WORKDIR /app
CMD ["/app/entrypoint.sh"]
