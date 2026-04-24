# Build context = repo root
# Build: docker compose -f examples/docker-parse-service/docker-compose.yml build

FROM node:20-slim AS liteparse-build
WORKDIR /build
COPY package.json package-lock.json tsconfig.json ./
COPY src/ src/
COPY cli/ cli/
RUN npm ci && npm run build

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libgl1 libglib2.0-0 libgomp1 libreoffice-writer \
    && rm -rf /var/lib/apt/lists/*

# Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# LiteParse from local build
COPY --from=liteparse-build /build/dist /usr/local/lib/node_modules/@llamaindex/liteparse/dist
COPY --from=liteparse-build /build/node_modules /usr/local/lib/node_modules/@llamaindex/liteparse/node_modules
COPY --from=liteparse-build /build/package.json /usr/local/lib/node_modules/@llamaindex/liteparse/package.json
RUN ln -s /usr/local/lib/node_modules/@llamaindex/liteparse/dist/src/index.js /usr/local/bin/lit \
    && chmod +x /usr/local/bin/lit

RUN pip install uv

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
ENV HOME=/tmp

CMD ["/app/entrypoint.sh"]
