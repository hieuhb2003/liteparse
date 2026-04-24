# Phase 01 — PaddleX Layout + Formula Recognition Server

## Context Links

- Ref server: `ocr/paddlex-layout/` (new) mirrors `ocr/paddleocr/server.py`
- PaddleX example: `paddle_exp/test.py`
- Config sample: `paddle_exp/my_config/formula_recognition.yaml`
- API spec to mirror style: `OCR_API_SPEC.md`
- Category reference: `paddle_exp/Screenshot from 2026-04-20 10-18-11_layout_det_res.png` (PicoDet-L_layout_17cls: text, title, figure, figure_title, table, table_title, header, footer, reference, equation, abstract, algorithm, content, doc_title, paragraph_title, formula, seal)

## Overview

- Priority: P1 (blocks 04)
- Status: TODO
- Standalone FastAPI service on port 8830 that runs PaddleX `formula_recognition` pipeline over a single image and returns structured layout + LaTeX data.

## Key Insights

- PaddleX `create_pipeline("formula_recognition")` already performs layout detection internally when `use_layout_detection=True`. No separate pipeline call needed.
- Coordinate drift: MUST pass `use_doc_orientation_classify=False` and `use_doc_unwarping=False`, otherwise the image is rotated/warped and bboxes no longer align with the input image.
- Pipeline result object exposes `layout_det_res` (with `boxes`) and `formula_res_list` (with `rec_formula` LaTeX). Need to correlate by bbox index or by spatial containment.
- Table class name in PicoDet-L_layout_17cls is `table`; formula class is `formula`. We filter everything else by default but return full set for downstream extensibility.

## Requirements

### Functional

- `POST /layout` accepts `multipart/form-data` with field `file` (image, required). Optional `threshold` (float, default 0.5).
- Response JSON:
  ```json
  {
    "image_width": 1654,
    "image_height": 2339,
    "layout": [
      {"type": "formula", "bbox": [x1,y1,x2,y2], "confidence": 0.91, "latex": "E=mc^2"},
      {"type": "table",   "bbox": [x1,y1,x2,y2], "confidence": 0.88},
      {"type": "text",    "bbox": [x1,y1,x2,y2], "confidence": 0.76}
    ]
  }
  ```
- `GET /health` → `{"status":"healthy"}`.
- Error responses: 400 for bad input image, 500 for pipeline exceptions; body `{"error": "..."}`.

### Non-functional

- Startup model download acceptable (mirrors paddleocr server).
- Single-process uvicorn; concurrency via client parallelism (not threads).
- Log each request at INFO with image size + element count.

## Architecture

```
client ──POST /layout─▶ FastAPI ──▶ PaddleXLayoutServer.detect(img)
                                      │
                                      ├─ pipeline.predict(..., use_layout_detection=True,
                                      │     use_doc_orientation_classify=False,
                                      │     use_doc_unwarping=False)
                                      │
                                      └─▶ normalize() ─▶ JSON
```

- `detect(image: np.ndarray) -> list[LayoutItem]`
- `normalize(pipeline_result) -> LayoutItem[]`: iterate `layout_det_res.boxes`, pull LaTeX from matching `formula_res_list` entries via bbox-center containment.

## Related Code Files

### Create

- `ocr/paddlex-layout/server.py` (≤200 LOC, main entry)
- `ocr/paddlex-layout/normalize.py` (extraction + bbox/LaTeX correlation helpers, ≤120 LOC)
- `ocr/paddlex-layout/test_server.py` (pytest + FastAPI TestClient)
- `ocr/paddlex-layout/pyproject.toml` (mirror `ocr/paddleocr/pyproject.toml`; dep: `paddlex`, `paddlepaddle`, `fastapi`, `uvicorn`, `pillow`, `numpy`, `python-multipart`)
- `ocr/paddlex-layout/Dockerfile`
- `ocr/paddlex-layout/README.md` (how to install, run, test)
- `ocr/paddlex-layout/my_config/formula_recognition.yaml` (copy of paddle_exp config; keep separate from paddle_exp which may be deleted)

### Modify

- `ocr/README.md` — add paddlex-layout entry in the server catalog.

## Implementation Steps

1. Scaffold `ocr/paddlex-layout/pyproject.toml` from paddleocr template; add `paddlex>=3.0.0`.
2. Copy `paddle_exp/my_config/formula_recognition.yaml` to `ocr/paddlex-layout/my_config/formula_recognition.yaml`.
3. Create `normalize.py`:
   - `LAYOUT_CLASS_MAP` — optional remap / passthrough.
   - `bbox_center(bbox) -> (cx, cy)` and `bbox_contains(outer, point) -> bool`.
   - `correlate_formula_latex(layout_boxes, formula_list) -> dict[int, str]` — map layout-box index → LaTeX by spatial containment of each formula result's center.
   - `normalize(pipeline_result) -> list[dict]`.
4. Create `server.py`:
   - Class `PaddleXLayoutServer` with `self.pipeline = create_pipeline("formula_recognition", config_path=...)` (config path optional).
   - `_create_app()` registers `/layout` and `/health`.
   - `/layout` handler: read file → PIL Image → RGB numpy → call `self.pipeline.predict(input=np_array, use_layout_detection=True, use_doc_orientation_classify=False, use_doc_unwarping=False)` → iterate result → call `normalize.normalize()` → return.
   - Apply optional `threshold` filter after normalize.
   - `serve()` → `uvicorn.run(app, host="0.0.0.0", port=8830)`.
5. Create `test_server.py`:
   - `MockPipeline` yielding a fake result object with one `formula` box + LaTeX and one `table` box.
   - Tests: `test_health`, `test_layout_endpoint_returns_normalized`, `test_threshold_filter`, `test_rejects_non_image`.
6. Write `README.md` with: prereqs, `uv sync`, `python server.py`, `curl` example, response schema.
7. Dockerfile parity with paddleocr (CPU base, install paddle, copy code, run uvicorn).

## Todo List

- [ ] `ocr/paddlex-layout/pyproject.toml` created and `uv sync` succeeds
- [ ] `my_config/formula_recognition.yaml` copied
- [ ] `normalize.py` implemented with helpers and docstrings
- [ ] `server.py` implemented with `/layout` + `/health`
- [ ] Mandatory flags applied: `use_layout_detection=True`, `use_doc_orientation_classify=False`, `use_doc_unwarping=False`
- [ ] `test_server.py` covers health + layout + threshold + bad-input cases; `pytest` passes
- [ ] README documents run + API schema
- [ ] Dockerfile builds
- [ ] `ocr/README.md` mentions new server

## Success Criteria

- `curl -F file=@page.png http://localhost:8830/layout` returns JSON with at least one `formula` entry containing non-empty `latex` for a known-good test image.
- `pytest ocr/paddlex-layout/` → all green.
- Starting server without GPU works (CPU fallback).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| PaddleX returns bboxes in wrong coord space (post-preprocessing) | Med | High | Hard-lock `use_doc_orientation_classify=False, use_doc_unwarping=False`; add assertion in tests that bbox.max ≤ image dims |
| LaTeX correlation by center-in-bbox wrong when formulas overlap | Low | Med | Fall back to IoU-max matching if center test yields no match |
| Model download at startup bloats cold start | Med | Low | Document with README; rely on Docker layer caching |
| Formula class name differs in minor PaddleX versions | Low | Med | Case-insensitive match + keep raw label in payload |

## Security Considerations

- No auth (same as paddleocr). Deploy behind private network or reverse proxy.
- Reject files >20MB (uvicorn + FastAPI default limits; add explicit `File(..., max_size=...)` check).
- Never log image bytes; log only `len(bytes)` and dims.

## Next Steps

- Blocks: phase-04 (parser wire-up requires live endpoint or deterministic mock).
- Follow-up: optional batch endpoint `/layout/batch` if per-page HTTP overhead dominates (defer until measured).
