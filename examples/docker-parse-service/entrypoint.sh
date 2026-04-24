#!/bin/bash
set -e

# Start PaddleX layout server in background
echo "Starting PaddleX layout server..."
cd /app/paddlex-layout
uv run python server.py &
LAYOUT_PID=$!

# Wait for layout server to be ready
echo "Waiting for layout server..."
for i in $(seq 1 120); do
    if curl -s http://localhost:8830/health > /dev/null 2>&1; then
        echo "Layout server ready."
        break
    fi
    if [ $i -eq 120 ]; then
        echo "WARNING: Layout server not ready after 240s, continuing anyway..."
    fi
    sleep 2
done

# Start FastAPI parse service
echo "Starting parse service on port 8080..."
cd /app/service
uv run python server.py

# Cleanup
kill $LAYOUT_PID 2>/dev/null
