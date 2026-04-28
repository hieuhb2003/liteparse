---
title: Docker Parse Service Rewrite (Single-Stage)
status: completed
created: 2026-04-28
completed: 2026-04-28
slug: docker-parse-service-rewrite
blockedBy: []
blocks: []
---

# Docker Parse Service Rewrite (Single-Stage)

Rewrite `examples/docker-parse-service/` to a working single-stage Docker image bundling LiteParse CLI + PaddleX layout server + FastAPI parse gateway. Goal: it builds and runs end-to-end (`POST /parse`). Optimization (multi-stage, slim images) deferred.

## Context

- Current Dockerfile dùng 2-stage build, tạo symlink `lit` thủ công, dùng `uv init` runtime để tạo venv riêng cho parse service. Build/run hay fail.
- User yêu cầu: single-stage, chạy được trước, chưa cần tối ưu.
- LiteParse CLI entry: `dist/src/index.js` (có shebang `#!/usr/bin/env node`).
- PaddleX layout server: chạy port 8830, cần model download lần đầu (~vài trăm MB).
- Parse service: FastAPI, port 8080, gọi `lit parse` qua subprocess + forward layout URL.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 01 | [Rewrite Dockerfile + Entrypoint + Service Pyproject](./phase-01-rewrite-dockerfile.md) | completed |
| 02 | [Build, Run, Smoke-Test, Iterate Fixes](./phase-02-test-and-validate.md) | completed |

## Outcome

- Image builds end-to-end on first try after `.dockerignore` fix.
- Parse smoke test on `QCVN 02-2020-BCA.pdf` (33 pages, Vietnamese): HTTP 200 in ~110s, 83K chars OCR'd, `<table>` markers from layout server present.
- Warm restart with cached PaddleX models: ready in <30s.

## Bonus Fix Applied (Not in Original Phase)

- **`.dockerignore` added at repo root.** Host had a stale `ocr/paddlex-layout/.venv` from local dev that was being COPYed into the image, clobbering the in-image venv built by `uv sync` and forcing a runtime rebuild. `.dockerignore` excludes `**/.venv`, `**/__pycache__`, `**/node_modules`, `**/dist`, etc.
- **`server.py` text join.** `lit parse --format json` leaves top-level `text` empty; gateway now joins per-page text so callers always get the full document.

## Key Decisions

- **Base image:** `python:3.12-slim` (bookworm). Đủ cho cả Node + Python, có apt thuận lợi.
- **Node:** install qua NodeSource setup_20.x trong cùng layer apt (gộp `apt-get update`).
- **LiteParse:** dùng `npm install -g .` từ source thay vì symlink thủ công → chạy hooks đầy đủ, chuẩn npm.
- **Python deps:** một venv duy nhất via `uv` cho cả paddlex-layout server và parse service. Merge dependencies vào `pyproject.toml` của paddlex-layout (hoặc tạo pyproject.toml gốc cho `/app`).
- **Model preload:** chạy server warm-up trong build step để tải model PaddleX vào image (tùy chọn, nếu build chậm thì để runtime).
- **Entrypoint:** start layout server background, healthcheck loop dài hơn (5 phút), rồi start FastAPI foreground.

## Success Criteria

- `docker compose -f examples/docker-parse-service/docker-compose.yml build` thành công.
- `docker compose up` start được, `/health` trả 200.
- `curl -F "file=@sample.pdf" http://localhost:8080/parse` trả JSON có `text` + `pages`.
- Container không crash trong 60s sau khi healthy.

## Out of Scope

- Multi-stage optimization
- GPU support
- Model bundling vào image
- Production hardening (non-root user, signed images, etc.)
