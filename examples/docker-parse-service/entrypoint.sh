#!/bin/bash
# Entrypoint: start PaddleX layout server in background, wait for it, then exec
# the FastAPI parse gateway in the foreground (so signals propagate).
set -euo pipefail

LAYOUT_HEALTH_URL="${LAYOUT_HEALTH_URL:-http://localhost:8830/health}"
LAYOUT_TIMEOUT_SECS="${LAYOUT_TIMEOUT_SECS:-600}"

echo "[entrypoint] Starting PaddleX layout server (background)..."
cd /app/paddlex-layout
uv run python server.py &
LAYOUT_PID=$!

cleanup() {
    echo "[entrypoint] Shutting down layout server (pid=${LAYOUT_PID})..."
    kill "${LAYOUT_PID}" 2>/dev/null || true
    wait "${LAYOUT_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[entrypoint] Waiting for layout server (max ${LAYOUT_TIMEOUT_SECS}s)..."
deadline=$(( $(date +%s) + LAYOUT_TIMEOUT_SECS ))
while :; do
    if curl -sf "${LAYOUT_HEALTH_URL}" > /dev/null 2>&1; then
        echo "[entrypoint] Layout server READY."
        break
    fi
    if ! kill -0 "${LAYOUT_PID}" 2>/dev/null; then
        echo "[entrypoint] FATAL: Layout server process died. Check logs above." >&2
        exit 1
    fi
    if [ "$(date +%s)" -ge "${deadline}" ]; then
        echo "[entrypoint] WARNING: Layout server not ready after ${LAYOUT_TIMEOUT_SECS}s. Continuing." >&2
        break
    fi
    sleep 2
done

echo "[entrypoint] Starting FastAPI parse service on :8080 ..."
cd /app/service
exec uv run --project /app/paddlex-layout python server.py
