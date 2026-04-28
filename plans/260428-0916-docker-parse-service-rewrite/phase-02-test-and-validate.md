# Phase 02: Build, Run, Smoke-Test, Iterate Fixes

## Context Links

- Output of phase 01: rewritten Dockerfile + entrypoint + compose
- README: `README.md` for `lit parse` CLI usage
- Sample PDF for testing: any small PDF (<5 pages) — can use `npm test` fixtures if any in `tests/`

## Overview

- **Priority:** P0
- **Status:** completed
- **Description:** Build the image, run the container, hit `/health` and `/parse`. Triage and fix any concrete failures (build errors, runtime crashes, parse failures).

## Key Insights

- First build is slow (~5–15 min): apt + npm + uv sync (paddlepaddle ~500MB).
- First container start is slow: PaddleX downloads models (~few hundred MB).
- After model cache via named volume, restarts are fast (<30s).

## Requirements

### Functional
- `docker compose build` exits 0.
- `docker compose up -d` → container `healthy` within 10 minutes.
- `GET /health` → 200 `{"status":"healthy",...}`.
- `POST /parse` with sample PDF → 200 with non-empty `text`.

### Non-functional
- No fatal errors in `docker compose logs` during steady state.
- Memory usage < 4GB (PaddleX baseline).

## Architecture

Test loop:
```
build → up → wait healthy → curl /health → curl /parse → inspect logs → fix → rebuild
```

## Related Code Files

### Read-only (for triage)
- All files from phase 01

### May modify (if triage reveals issues)
- `Dockerfile` — fix missing apt deps, version pins
- `entrypoint.sh` — fix race conditions, env propagation
- `docker-compose.yml` — fix volume paths, env vars

## Implementation Steps

### 1. Build

```bash
cd /home/hieunguyenmanh/projects/liteparse
docker compose -f examples/docker-parse-service/docker-compose.yml build 2>&1 | tee /tmp/build.log
```

If build fails: read last 50 lines of log, identify root cause, fix in Dockerfile, rebuild.

Common build failures + fixes:
| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `npm ci` ENOTFOUND | DNS/proxy in build env | `--network=host` or pre-cache |
| `npm run build` tsc errors | Missing tsconfig path | Verify `tsconfig.json` copied |
| `uv sync` paddlepaddle index timeout | Slow CN mirror | Retry, or pin version |
| `lit --help` not found post-install | npm bin path issue | `which lit` debug, ensure `/usr/lib/node_modules/.bin` in PATH |
| `libreoffice` not found | wrong package name | Try `libreoffice-core` or full `libreoffice` |

### 2. First Run (cold model load)

```bash
docker compose -f examples/docker-parse-service/docker-compose.yml up -d
docker compose -f examples/docker-parse-service/docker-compose.yml logs -f parser
# Wait for "[entrypoint] Layout server READY." then "Uvicorn running on..."
```

If layout server takes >5 min: increase `LAYOUT_TIMEOUT_SECS` or pre-warm.

### 3. Smoke Tests

```bash
# Health
curl -fsS http://localhost:8080/health
# Expect: {"status":"healthy","layout_server":"http://localhost:8830/layout"}

# Parse (use any small PDF on host)
curl -fsS -X POST -F "file=@/path/to/sample.pdf" http://localhost:8080/parse | jq '.text | length'
# Expect: positive integer
```

### 4. Triage Common Runtime Failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `lit: command not found` | npm global bin missing from PATH | Check `npm bin -g` location; symlink to `/usr/local/bin/lit` if needed |
| `subprocess.CalledProcessError: lit parse` | LiteParse can't find tessdata or libreoffice | Set `TESSDATA_PREFIX`; verify `libreoffice --headless` works |
| Layout server crashes loop | OOM (PaddleX hungry) | Bump container memory; switch to lighter pipeline; defer to perf pass |
| `/parse` returns empty text | OCR disabled? | Check parse cmd; default Tesseract should work |
| 504 timeout on /parse | Sequential layout slow | Increase subprocess timeout in `server.py`; or test with smaller PDF |
| `EACCES /tmp/liteparse` | Volume permission | `chmod 777` host dir or remove mount |

### 5. Validate Steady State

- Run 3 sequential parses, verify each succeeds.
- `docker compose stop && docker compose start` → healthy in <60s (warm models).

### 6. Document Quick Start

Add a short "Run with Docker" snippet to `examples/docker-parse-service/` (no separate README created; if needed, ask user).

## Todo List

- [x] Build image, capture log on failure, fix (root cause: host `.venv` leaking into build context → fixed via `.dockerignore`)
- [x] Start container, wait for healthy
- [x] `curl /health` succeeds → `{"status":"healthy",...}`
- [x] `curl /parse` with `QCVN 02-2020-BCA.pdf` succeeds → HTTP 200, 33 pages, 83K chars Vietnamese, `<table>` markers
- [x] Restart test (warm cache) → ready in ~30s vs ~3min cold
- [x] `.dockerignore` documented in plan

## Success Criteria

- All Phase 02 todo items checked.
- A clean run from `docker compose down -v && docker compose build && docker compose up` works end-to-end (assuming user has internet for first model download).

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Build very slow (>20 min) on first run | High | Document expectation; consider BuildKit cache mount in optional follow-up |
| PaddleX model download fails | Med | Document `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK`; add retry logic if blocking |
| Subprocess timeout (300s) too tight for big PDFs | Low | Bump in `server.py` or expose as env |
| Concurrent requests cause layout OOM | Med | Acceptable for "make it work"; document single-concurrency expectation |

## Security Considerations

- N/A for test phase.

## Next Steps

- After Phase 02 green: optional follow-up plan for multi-stage optimization, smaller image, GPU support.

## Unresolved Questions

- Có sẵn sample PDF nào trong repo để test? Nếu không thì cần user cung cấp.
- User test trên máy nào (CPU only? RAM?) — ảnh hưởng tới việc bật model cache volume mặc định.
