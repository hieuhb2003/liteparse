# Phase 04 — Parser Integration

## Context Links

- Entrypoint: `src/core/parser.ts` (lines ~160-175 is the insertion site)
- Depends on phase-02 (`HttpLayoutEngine`), phase-03 (`applyLayoutElements`)
- Renderer: `src/engines/pdf/pdfium-renderer.ts` (`renderPageToBuffer(pdfInput, pageNum, dpi)`)
- Concurrency: `p-limit` (already imported in parser.ts)

## Overview

- Priority: P1
- Status: TODO
- Hook the LayoutEngine into the parse pipeline: AFTER `extractAllPages` + OCR, BEFORE `projectPagesToGrid`. For each target page, render to image at config DPI → call layout engine → apply to page via phase-03 helpers. Full graceful fallback on any failure.

## Key Insights

- PdfiumRenderer must be explicitly initialized (`init()` + `loadDocument()`); `renderPageToBuffer(undefined, pageNum, dpi)` uses the cached doc. Must close in `finally`.
- OCR and layout both need page images; OCR path currently uses `pdfEngine.renderPageImage`. For consistency keep the same renderer chain (PdfiumRenderer) to avoid duplicate raster passes — consider one render per page shared across stages (optimization, not required for correctness).
- Failure modes to swallow: server unreachable, timeout, malformed response, individual page error → warn + skip that page, keep parsing.
- Must NOT touch the pipeline when `layoutEngine` is undefined (i.e., feature opt-in, default off).
- Concurrency: reuse `numWorkers` via `p-limit`. Each slot handles: render → HTTP call → mutate textItems. Single `p-limit` instance keeps memory bounded.

## Requirements

### Functional

- Parser constructor: if `config.layoutServerUrl` set AND `config.layoutEnabled !== false`, instantiate `new HttpLayoutEngine(config.layoutServerUrl)`.
- In `parse()`, after OCR step, add a `runLayout(pages)` step that:
  1. No-op if `this.layoutEngine` undefined
  2. Init `PdfiumRenderer`, `loadDocument` of current input
  3. For each page in `pages`, via `p-limit(numWorkers)`:
     - Render page to buffer at `config.dpi`
     - Call `layoutEngine.detect(buffer)`
     - Call `applyLayoutElements(page, detection, config.dpi)`
  4. On any per-page error: `log('Layout failed for page N: ...')`, continue
  5. On pipeline-level error (renderer init): `log('Layout disabled: ...')`, continue with original pages
  6. `finally`: close renderer document
- Must pass a PDF source to `renderPageToBuffer`. If input is a file path use it; if Buffer, reuse the same buffer PdfiumRenderer already supports.

### Non-functional

- No new top-level dependencies.
- Added code ≤80 LOC in parser.ts; split into private method `runLayout(doc, pages, pdfInput, log)`.
- Feature gating by config, no env vars.

## Architecture

```
parse(input)
  ├─ load / convert → doc
  ├─ extractAllPages
  ├─ [OCR]                       (existing)
  ├─ [LAYOUT] ← NEW              runLayout(doc, pages, pdfInput, log)
  │      ├─ PdfiumRenderer init + loadDocument(pdfInput)
  │      ├─ p-limit over pages
  │      │     ├─ renderPageToBuffer(_, pageNum, dpi)
  │      │     ├─ layoutEngine.detect(buf)
  │      │     └─ applyLayoutElements(page, detection, dpi)
  │      └─ close renderer
  ├─ projectPagesToGrid
  └─ buildBoundingBoxes / format
```

## Related Code Files

### Modify

- `src/core/parser.ts`:
  - Add `private layoutEngine?: LayoutEngine` field
  - Constructor: instantiate when config says so
  - Add private `runLayout(pages, pdfInput, log)` method
  - Call `runLayout` after `runOCR` and before `projectPagesToGrid`
  - Ensure `pdfInput` accessible at call site (hoist variable before the try block)
- `src/core/parser.test.ts` (create if missing, or extend existing): integration test with mocked LayoutEngine

### Create

- `src/core/parser-layout.test.ts` (focused Vitest: mock `HttpLayoutEngine`, mock renderer, verify `applyLayoutElements` invoked per page + errors swallowed)

## Implementation Steps

1. Import additions at top of `parser.ts`:
   ```ts
   import { LayoutEngine } from "../engines/layout/interface.js";
   import { HttpLayoutEngine } from "../engines/layout/http-layout-engine.js";
   import { applyLayoutElements } from "../processing/layout-mapping.js";
   ```
2. Add `private layoutEngine?: LayoutEngine;` field.
3. In constructor, after OCR init block:
   ```ts
   if (this.config.layoutServerUrl && this.config.layoutEnabled !== false) {
     this.layoutEngine = new HttpLayoutEngine(this.config.layoutServerUrl);
   }
   ```
4. Refactor `parse()` so `pdfInput` (the raw `string | Uint8Array` or a resolvable reference) is in scope for the layout step. Cleanest: after `doc = await ... loadDocument(pdfPath or bytes)`, keep `pdfInput` local:
   ```ts
   const pdfInput: string | Uint8Array = typeof input === 'string' ? pdfPath : data;
   ```
5. Add private method:
   ```ts
   private async runLayout(pages: PageData[], pdfInput: string | Uint8Array, log: (m: string) => void) {
     if (!this.layoutEngine) return;
     const renderer = new PdfiumRenderer();
     try {
       await renderer.init();
       await renderer.loadDocument(pdfInput, this.config.password);
       const limit = pLimit(this.config.numWorkers);
       await Promise.all(pages.map(page => limit(async () => {
         try {
           const buf = await renderer.renderPageToBuffer(undefined, page.pageNum, this.config.dpi);
           const det = await this.layoutEngine!.detect(buf);
           applyLayoutElements(page, det, this.config.dpi);
         } catch (e) {
           log(`Layout failed for page ${page.pageNum}: ${(e as Error).message}`);
         }
       })));
     } catch (e) {
       log(`Layout stage disabled due to error: ${(e as Error).message}`);
     } finally {
       await renderer.close?.();
     }
   }
   ```
   (Adapt `renderer.close` name to actual API — verify in pdfium-renderer.ts.)
6. Call `await this.runLayout(pages, pdfInput, log);` after the OCR block, before `projectPagesToGrid`.
7. Add tests:
   - Happy path: mocked engine returns one formula + one table, asserts `page.textItems` contains `<formula>` and `<table>` strings after call
   - Server throws: final output text does NOT contain tags, no crash
   - Config off (no URL): `runLayout` is a no-op (spy on engine never called)
   - Multi-page: all pages processed regardless of one page failing

## Todo List

- [ ] Parser imports + `layoutEngine` field added
- [ ] Constructor gating correct (url required, enabled defaults true)
- [ ] `runLayout` implemented with p-limit + try/catch per page
- [ ] Call site placed between OCR and grid projection
- [ ] Renderer closed in `finally`
- [ ] Tests: happy, error, disabled, multi-page green
- [ ] No existing tests regressed (`npm test`)

## Success Criteria

- With `layoutServerUrl` set and a live phase-01 server, parsing a PDF with a formula produces `<formula>...</formula>` in `result.text`.
- With server down, parse completes and output matches baseline (pre-change) byte-for-byte except for warn logs.
- Existing test suite passes.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Double render (OCR + layout both rasterize each page) | High | Med (perf) | Acceptable v1; document as known; optimize later via shared render cache if profiling flags it |
| Renderer `close` API name wrong | Low | Low | Confirm in `pdfium-renderer.ts` before coding; tests would catch |
| `pdfInput` scoping across try/catch (path vs bytes) | Med | Med | Pre-compute once before `try` block; explicit typing |
| Concurrency starves OCR on small `numWorkers` | Low | Low | Reuse same numWorkers knob; document trade-off |
| Layout errors silently drop tags users expect | Med | Med | Always `log()` per-page failure; surface count in final log line |

## Security Considerations

- `layoutServerUrl` must be validated (http/https) in constructor to prevent SSRF via file:// URLs.
- Timeouts (60s) already enforced in HttpLayoutEngine.

## Next Steps

- Unblocks phase-05 (CLI + docs + integration tests against real server).
