# Build context = repo root
# Build: docker compose -f examples/docker-parse-service/docker-compose.yml build

FROM node:20-slim AS liteparse
RUN npm install -g @llamaindex/liteparse

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv

# LiteParse CLI
COPY --from=liteparse /usr/local/lib/node_modules/@llamaindex/liteparse /usr/local/lib/node_modules/@llamaindex/liteparse
COPY --from=liteparse /usr/local/bin/lit /usr/local/bin/lit

# PaddleX layout server
COPY ocr/paddlex-layout/ /app/paddlex-layout/
WORKDIR /app/paddlex-layout
RUN uv sync

# Parse service
COPY examples/docker-parse-service/server.py /app/service/
WORKDIR /app/service
RUN uv init --no-workspace 2>/dev/null || true
RUN uv add fastapi uvicorn python-multipart

COPY examples/docker-parse-service/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080
ENV LAYOUT_SERVER_URL=http://localhost:8830/layout
ENV LIT_BIN=lit

CMD ["/app/entrypoint.sh"]
