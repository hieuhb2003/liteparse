---
title: "PaddleX Layout + Formula OCR Integration"
description: "New layout detection server returning formula LaTeX + table bboxes, mapped into liteparse output as <formula>/<table> tags."
status: complete
priority: P2
effort: 18h
branch: main
tags: [ocr, layout, paddlex, formula, pipeline, typescript, python]
created: 2026-04-23
---

## Goal

Add an opt-in layout-detection stage to liteparse. New Python server (`ocr/paddlex-layout/`) runs PaddleX `formula_recognition` pipeline to return per-page bboxes for formulas (with LaTeX) and tables. A new TypeScript `LayoutEngine` abstraction (`src/engines/layout/`) calls the server, converts pixel bboxes to PDF points, and mutates `page.textItems` before grid projection to inject `<formula>...</formula>` (text replaced) and `<table>...</table>` (text wrapped) tags.

## Activation

- Config: `layoutServerUrl` set AND `layoutEnabled !== false`
- CLI: `--layout-server-url <url>` (implicit enable), `--no-layout`
- Default: feature OFF; existing pipeline untouched

## Phases

| # | File | Status | Effort | Owner |
|---|------|--------|--------|-------|
| 01 | [phase-01-paddlex-layout-server.md](./phase-01-paddlex-layout-server.md) | DONE | 4h | backend |
| 02 | [phase-02-layout-engine-abstraction.md](./phase-02-layout-engine-abstraction.md) | DONE | 2h | typescript |
| 03 | [phase-03-coordinate-mapping-and-tag-insertion.md](./phase-03-coordinate-mapping-and-tag-insertion.md) | DONE | 4h | typescript |
| 04 | [phase-04-parser-integration.md](./phase-04-parser-integration.md) | DONE | 3h | typescript |
| 05 | [phase-05-cli-config-tests-docs.md](./phase-05-cli-config-tests-docs.md) | DONE | 5h | typescript+docs |

## Dependency Graph

```
01 (server)  ──┐
               ├──▶ 04 (parser wire-up) ──▶ 05 (cli+docs+tests)
02 (engine) ──▶ 03 (mapping) ──────────────┘
```

- 01 and 02 runnable in parallel
- 03 depends on 02 (needs `LayoutElement` type)
- 04 depends on 02+03 (needs engine + mapping funcs); can stub against 01 via mock server
- 05 depends on 04

## File Ownership (no overlap across parallel phases)

- 01 → `ocr/paddlex-layout/**` (new)
- 02 → `src/engines/layout/**` (new) + `src/core/types.ts` (config additions only)
- 03 → `src/processing/layoutMapping.ts` (new) + tests
- 04 → `src/core/parser.ts` (modify)
- 05 → `cli/parse.ts`, `src/lib.ts`, `README.md`, `docs/**`, `LAYOUT_API_SPEC.md` (new)

## Success Criteria

- Layout server returns well-formed JSON for sample PDFs with formulas + tables
- `LiteParse.parse()` with `layoutServerUrl` set produces `<formula>...</formula>` and `<table>...</table>` in output text
- Feature fully disabled when `layoutServerUrl` absent: output byte-identical to pre-change baseline
- Server unreachable → warning logged, parse completes successfully without tags
- All new files ≤200 LOC; Vitest suite green; `tsc --noEmit` clean

## Rollback

Feature is opt-in. Disabling: remove `layoutServerUrl` from config / drop `--layout-server-url` flag. No data migrations. To revert code: drop `src/engines/layout/`, `src/processing/layoutMapping.ts`, `ocr/paddlex-layout/`, and the integration hunk in `parser.ts`.

## Unresolved Questions

1. Should tag tokens be user-configurable (e.g. `<math>` vs `<formula>`)? Default answer: NO (KISS).
2. Confidence threshold for accepting layout detections? Suggest default `0.5` (matches yaml), expose via config only if needed.
3. Do we need per-page parallelism limit separate from `numWorkers`? Plan reuses `numWorkers`.
