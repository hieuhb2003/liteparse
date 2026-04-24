# Phase 02 — Layout Engine Abstraction (TypeScript)

## Context Links

- Mirror pattern: `src/engines/ocr/interface.ts`, `src/engines/ocr/http-simple.ts`
- Config sink: `src/core/types.ts` (`LiteParseConfig`)
- Consumer: phase-03 (mapping) and phase-04 (parser)

## Overview

- Priority: P1 (blocks 03, 04)
- Status: TODO
- Create a `LayoutEngine` interface + HTTP implementation parallel to `OcrEngine`. Add config fields. No pipeline wiring here.

## Key Insights

- OCR engine already has both in-process (Tesseract) and HTTP variants. Layout feature is remote-only for now → single HTTP impl. Interface still needed for future engines (YAGNI watchdog: keep interface minimal).
- Response schema differs from OCR: layout items carry `type`, optional `latex`. Must NOT shoehorn into `OcrResult`.
- Use the same axios + form-data + 60s timeout pattern to minimize new deps.

## Requirements

### Functional

- `LayoutEngine.detect(image: Buffer | string, options?: LayoutOptions): Promise<LayoutDetection>`
- Returns `{ imageWidth, imageHeight, elements: LayoutElement[] }`
- `LayoutElement = { type: string; bbox: [x1,y1,x2,y2]; confidence: number; latex?: string }`
- HTTP engine errors → resolve with empty elements array + console.warn (mirrors `HttpOcrEngine`).

### Non-functional

- All files ≤200 LOC.
- Zero new third-party deps; reuse axios + form-data already in `package.json`.
- Strict TypeScript; exported symbols documented with TSDoc.

## Architecture

```
LayoutEngine (interface)
   ▲
   │ impl
HttpLayoutEngine ── axios POST /layout ──▶ paddlex-layout server (phase 01)
```

Config plumbing:
```
LiteParseConfig { layoutServerUrl?: string; layoutEnabled?: boolean }
        │
        ▼
LiteParse constructor instantiates HttpLayoutEngine when
(layoutServerUrl set) AND (layoutEnabled !== false)
```

## Related Code Files

### Create

- `src/engines/layout/interface.ts` (types + interface, ≤60 LOC)
- `src/engines/layout/http-layout-engine.ts` (HTTP impl, ≤150 LOC)
- `src/engines/layout/index.ts` (barrel)
- `src/engines/layout/README.md` (usage + extension guide)
- `src/engines/layout/http-layout-engine.test.ts` (Vitest: mock axios; success, error, malformed response)

### Modify

- `src/core/types.ts` — add `layoutServerUrl?: string; layoutEnabled?: boolean` to `LiteParseConfig` with TSDoc.
- `src/core/config.ts` — wire defaults (`layoutEnabled: true` when url present; feature still gated by url presence).

## Implementation Steps

1. Add `interface.ts`:
   ```ts
   export type LayoutType = "formula" | "table" | "text" | "title" | "figure" | "header" | "footer" | (string & {});
   export interface LayoutElement { type: LayoutType; bbox: [number,number,number,number]; confidence: number; latex?: string; }
   export interface LayoutDetection { imageWidth: number; imageHeight: number; elements: LayoutElement[]; }
   export interface LayoutOptions { threshold?: number; }
   export interface LayoutEngine { name: string; detect(image: Buffer | string, options?: LayoutOptions): Promise<LayoutDetection>; }
   ```
2. Add `http-layout-engine.ts`:
   - Class `HttpLayoutEngine` with `name = "http-layout"`, constructor `(serverUrl: string)`.
   - `detect`: if `image` is string treat as file path (`fs.createReadStream`); else send buffer. `formData.append('threshold', ...)` when set.
   - POST to `serverUrl`, 60s timeout; validate response shape; tolerate missing `latex`; map into `LayoutDetection`.
   - On error: `console.warn` with concise label; return `{ imageWidth: 0, imageHeight: 0, elements: [] }` so callers can no-op.
3. Add `index.ts` barrel exporting interface + impl.
4. Add config fields and types in `src/core/types.ts` with TSDoc pointing at `LAYOUT_API_SPEC.md` (created in phase-05).
5. Update `src/core/config.ts` defaults (explicit `layoutEnabled: true` default; gated by `layoutServerUrl`).
6. Write Vitest tests:
   - Happy path: axios mocked; returns two elements (formula + table); check mapping.
   - HTTP 500: resolves with empty elements, console.warn called.
   - Malformed JSON (missing `elements`): resolves empty, warn called.
   - Buffer vs path: both FormData variants covered.

## Todo List

- [ ] `interface.ts` authored with types
- [ ] `http-layout-engine.ts` implemented
- [ ] Barrel `index.ts` exports public API
- [ ] `LiteParseConfig` extended with `layoutServerUrl` + `layoutEnabled`
- [ ] `config.ts` defaults updated
- [ ] Vitest suite passes for happy, error, malformed, path, buffer paths
- [ ] `tsc --noEmit` clean
- [ ] README documents interface + extension steps

## Success Criteria

- `new HttpLayoutEngine("http://localhost:8830/layout").detect(buf)` returns typed `LayoutDetection`.
- Unit tests green; coverage ≥ existing OCR http test coverage.
- Exporting `LayoutEngine` from `src/lib.ts` (done in phase-05) does not introduce circular imports.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Interface mismatch with phase-01 response | Low | High | Align JSON schema explicitly in this doc + phase-01 doc; add test with canned JSON fixture |
| Silent empty results masking server outage | Med | Med | Always `console.warn` with status code; document behavior in README |
| Buffer upload filename mismatch breaks some FastAPI configs | Low | Low | Reuse `image.png`/`image/png` convention from `http-simple.ts` |

## Security Considerations

- No auth header in v1. Config validation: if `layoutServerUrl` isn't http/https, throw at constructor time.
- Do not log image bytes in error paths.

## Next Steps

- Unblocks phase-03 (mapping consumes `LayoutElement[]`) and phase-04 (parser uses `LayoutEngine`).
