# Phase 05 — CLI, Config, End-to-End Tests, and Docs

## Context Links

- CLI: `cli/parse.ts`
- Public API: `src/lib.ts`
- Specs: `OCR_API_SPEC.md` (sibling spec to mirror)
- Project docs: `docs/system-architecture.md`, `docs/codebase-summary.md`, `docs/project-roadmap.md`
- Depends on: phases 01, 02, 03, 04 complete

## Overview

- Priority: P2
- Status: TODO
- User-facing surface: CLI flags, library exports, API spec, integration tests, and docs. Final phase that ships the feature.

## Key Insights

- CLI parity: every `LiteParseConfig` field eventually gets a `--flag`; `--layout-server-url` + `--no-layout` are the minimum.
- API spec needs its own doc (`LAYOUT_API_SPEC.md`) parallel to `OCR_API_SPEC.md` so third parties can build alternative layout servers without reading our source.
- Integration test needs a fixture PDF containing a formula and a table. Use an existing fixture if one has them; otherwise generate a minimal synthetic PDF via `pdf-lib` at test-time (no new committed binaries if avoidable).
- Docs must reflect new `LayoutEngine` abstraction in `system-architecture.md` and be visible in `codebase-summary.md`.

## Requirements

### Functional

- CLI flags in `cli/parse.ts`:
  - `--layout-server-url <url>` (string)
  - `--no-layout` (bool; defaults to layout enabled when URL present)
- Same flags available for `parse` and `batch-parse` subcommands
- `src/lib.ts` re-exports: `LayoutEngine`, `HttpLayoutEngine`, `LayoutElement`, `LayoutDetection`, `LayoutOptions`
- `LAYOUT_API_SPEC.md` authored at repo root
- `README.md` updated with layout server section + minimal example
- `docs/system-architecture.md` updated with layout stage in the pipeline diagram
- `docs/codebase-summary.md` updated with `src/engines/layout/` and `src/processing/layout-mapping.ts` entries
- `docs/project-roadmap.md` updated with the shipped feature under current phase
- Integration test: real HTTP server optional; Vitest spins a fake server via `node:http` responding with canned JSON, verifies `<formula>` and `<table>` present in parse output

### Non-functional

- No new runtime deps.
- Docs diff must not alter unrelated sections.

## Architecture

```
User CLI ──▶ cli/parse.ts (flags) ──▶ LiteParseConfig ──▶ LiteParse (layer-04) ──▶ HttpLayoutEngine (layer-02) ──▶ paddlex-layout server (layer-01)
                                                                                          │
                                                                                          ▼
                                                                            layout-mapping (layer-03) applied to PageData
```

## Related Code Files

### Create

- `LAYOUT_API_SPEC.md` at repo root (mirrors structure of `OCR_API_SPEC.md`)
- `tests/integration/layout-integration.test.ts` (Vitest, uses built-in `http` module to fake layout server)

### Modify

- `cli/parse.ts`:
  - Add `--layout-server-url`, `--no-layout` options to `parse` and `batch-parse` commands
  - Extend `ParseCommandOptions` / `BatchParseCommandOptions` interfaces
  - Propagate into `LiteParseConfig` object passed to constructor
- `src/lib.ts` — add re-exports
- `README.md` — new "Layout & Formula Recognition" section
- `docs/system-architecture.md` — add layout stage + LayoutEngine diagram block
- `docs/codebase-summary.md` — list new modules
- `docs/project-roadmap.md` — record the feature under current milestone

## Implementation Steps

1. `cli/parse.ts`:
   - Extend interfaces `ParseCommandOptions` and `BatchParseCommandOptions` with `layoutServerUrl?: string; layout?: boolean`
   - Add `.option("--layout-server-url <url>", "HTTP layout server URL (enables formula + table layout detection)")` and `.option("--no-layout", "Disable layout/formula detection even if URL is set")` on both subcommands
   - In the parse handler, when building `LiteParseConfig`, map:
     ```ts
     layoutServerUrl: options.layoutServerUrl,
     layoutEnabled: options.layout === false ? false : undefined,
     ```
2. `src/lib.ts` — add barrel re-exports for layout types/classes.
3. Create `LAYOUT_API_SPEC.md`:
   - Copy skeleton from `OCR_API_SPEC.md`
   - Document `POST /layout` request (`file`, optional `threshold`)
   - Response JSON schema (`image_width`, `image_height`, `layout[]`)
   - Mandatory server-side flags note (must set `use_doc_orientation_classify=False`, `use_doc_unwarping=False` if using PaddleX) to preserve coordinates
   - `GET /health`
4. `README.md` — add section:
   ````md
   ## Layout & Formula Recognition (optional)
   Run the PaddleX layout server:
   ```bash
   cd ocr/paddlex-layout && uv sync && python server.py
   ```
   Use it from the CLI:
   ```bash
   lit parse doc.pdf --layout-server-url http://localhost:8830/layout
   ```
   Formulas are wrapped as `<formula>LATEX</formula>`; tables as `<table>...</table>`.
   See [LAYOUT_API_SPEC.md](./LAYOUT_API_SPEC.md).
   ````
5. `docs/system-architecture.md` — insert layout stage between OCR and grid projection. Include a short Mermaid or ASCII sequence diagram matching phase-04 architecture block.
6. `docs/codebase-summary.md` — add bullet entries:
   - `src/engines/layout/` — HTTP layout engine abstraction (phase-02)
   - `src/processing/layout-mapping.ts` — bbox → TextItem tag injection (phase-03)
   - `ocr/paddlex-layout/` — reference PaddleX formula + layout server (phase-01)
7. `docs/project-roadmap.md` — mark feature shipped with date.
8. Integration test `tests/integration/layout-integration.test.ts`:
   - Start an `http.createServer` on ephemeral port
   - When `POST /layout` hit, respond with canned JSON containing a formula bbox + `latex: "E=mc^2"` and a table bbox whose coords match a known region in `tests/fixtures/simple-formula.pdf` (use existing fixture or generate via `pdf-lib`)
   - Run `new LiteParse({ layoutServerUrl: ... }).parse(pdf)`
   - Assert `result.text.includes("<formula>E=mc^2</formula>")` and `result.text.includes("<table>")` and `</table>`
   - Tear down fake server in `afterAll`
9. Run full test suite: `npm test`. Fix any regressions. Run `tsc --noEmit`. Run `npm run build` to verify bundling.

## Todo List

- [ ] CLI flags added to `parse` and `batch-parse`
- [ ] `LiteParseConfig` mapping for flags verified
- [ ] `src/lib.ts` re-exports added
- [ ] `LAYOUT_API_SPEC.md` authored with full schema
- [ ] `README.md` has Layout section + example
- [ ] `docs/system-architecture.md` reflects new pipeline stage
- [ ] `docs/codebase-summary.md` lists new modules
- [ ] `docs/project-roadmap.md` updated
- [ ] Integration test with fake HTTP server passes
- [ ] Full `npm test` green + `tsc --noEmit` clean + `npm run build` succeeds
- [ ] Manual smoke: run CLI against live paddlex-layout server on one sample PDF

## Success Criteria

- `lit parse sample.pdf --layout-server-url http://localhost:8830/layout` outputs text containing `<formula>` and/or `<table>` tags for a formula/table-bearing PDF.
- `lit parse sample.pdf` (no layout flag) unchanged from baseline.
- `LAYOUT_API_SPEC.md` sufficient for a stranger to implement a drop-in layout server.
- All docs updated and cross-referenced.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Integration test flaky due to ephemeral port collisions | Low | Low | Bind to port 0, read assigned port, inject into LiteParse config |
| Docs drift over time | Med | Low | Add `docs/codebase-summary.md` entry explicitly pointing to API spec |
| CLI flag naming conflict | Low | Low | `--layout-*` namespace is free; confirmed no collisions |
| Readme grows unwieldy | Low | Low | New section is ≤20 lines; long details live in `LAYOUT_API_SPEC.md` |

## Security Considerations

- Document in `LAYOUT_API_SPEC.md` that production deployments must put the layout server behind auth/private network.
- Remind users that LaTeX from OCR is untrusted and should be sanitized in downstream renderers.

## Next Steps

- Post-ship: monitor perf impact; consider optional batch endpoint (`/layout/batch`) if per-page latency dominates.
- Possible follow-up: shared render cache across OCR + layout stages.
