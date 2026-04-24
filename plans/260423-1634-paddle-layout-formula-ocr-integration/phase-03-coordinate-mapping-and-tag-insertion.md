# Phase 03 — Coordinate Mapping & Tag Insertion

## Context Links

- Types: `src/core/types.ts` (`TextItem`, `PageData`)
- Consumer: phase-04 (parser integration)
- Input types: `LayoutElement` from `src/engines/layout/interface.ts` (phase-02)
- Reference: `src/processing/bbox.ts`, `src/processing/gridProjection.ts` for TextItem manipulation patterns

## Overview

- Priority: P1 (blocks 04)
- Status: TODO
- Pure function module that transforms `(PageData, LayoutElement[], dpi) → mutated PageData`. Removes text items inside formula bboxes, injects synthetic TextItems carrying `<formula>`/`<table>` tags. No I/O, fully deterministic, easy to test.

## Key Insights

- Coordinate systems:
  - Layout server returns pixels at `config.dpi` (typically 150)
  - `TextItem` uses PDF points at 72 DPI, top-left origin
  - Conversion: `pdf = px * 72 / dpi`
- Formula strategy: REPLACE (remove native items in bbox, insert one synthetic text `<formula>${latex}</formula>` at bbox top-left)
- Table strategy: WRAP (keep native items; insert `<table>` at top-left and `</table>` at bottom-left)
- "Inside bbox" uses center-point containment (robust to partial glyph overlap; already used elsewhere)
- Grid projection renders synthetic items like any TextItem; tags will appear inline in text output. Positioning matters: the `<table>` opener needs y slightly above the first row so it renders on the line before; close tag y slightly below last row.
- Nested regions: formulas INSIDE tables exist (matrix cells). Process formulas FIRST so text is already replaced when tables wrap. Synthetic formula TextItem stays inside the table region.

## Requirements

### Functional

- `imageBboxToPdf([px1,py1,px2,py2], dpi): {x,y,w,h}` — top-left anchor convention consistent with TextItem
- `pointInRect(px, py, rect): boolean`
- `textItemCenter(item): {x,y}`
- `applyFormulaElements(page, elements, dpi): void` — mutates `page.textItems`:
  1. For each element with `type === "formula"` and `latex` non-empty:
     - Convert bbox → PDF rect
     - Remove `textItems` whose center lies inside rect
     - Push synthetic `TextItem`: `{ str: "<formula>${latex}</formula>", x, y, width: w, height: h, w, h, fontName: "LAYOUT", confidence, isPlaceholder: false }` with `isFormula: true` (new optional field on TextItem)
- `applyTableElements(page, elements, dpi): void`:
  1. For each element with `type === "table"`:
     - Convert bbox → PDF rect
     - Push synthetic open tag at `(x, y - ε)` with `str: "<table>"` and close tag at `(x, y + h + ε)` with `str: "</table>"`, both with `isTableMarker: true`, small height (1pt) so grid projection treats them as their own line
     - Use `ε = 0.5` pt (half a point); low enough not to collide, high enough to separate lines
  2. Do NOT remove or modify items inside table bbox
- All mutations sorted by `y` afterwards to keep grid projection happy (existing code likely re-sorts, confirm in implementation).

### Non-functional

- File ≤200 LOC. Split into `layout-mapping.ts` (public API) + `layout-bbox.ts` (geometry helpers) if needed.
- No external deps; pure TypeScript.

## Architecture

```
PageData ─┐
          │    ┌─────────────────────────────┐
Elements ─┼───▶│ applyFormulaElements        │──▶ mutated textItems (formulas replaced)
          │    └─────────────────────────────┘
          │                    │
          │                    ▼
          │    ┌─────────────────────────────┐
          └───▶│ applyTableElements          │──▶ mutated textItems (tables wrapped)
               └─────────────────────────────┘
```

Order matters: formulas first, tables second.

## Related Code Files

### Create

- `src/processing/layout-mapping.ts` (public API, orchestrator, ≤150 LOC)
- `src/processing/layout-bbox.ts` (geometry helpers, ≤80 LOC)
- `src/processing/layout-mapping.test.ts` (Vitest; ≤200 LOC)
- `src/processing/layout-bbox.test.ts` (Vitest; ≤120 LOC)

### Modify

- `src/core/types.ts` — add optional `isFormula?: boolean; isTableMarker?: boolean` flags on `TextItem` (opt-in, default undefined)

## Implementation Steps

1. Create `layout-bbox.ts`:
   - `imageBboxToPdf(bbox: [number,number,number,number], dpi: number): { x: number; y: number; w: number; h: number }`
   - `pointInRect(x: number, y: number, r: { x,y,w,h }): boolean`
   - `textItemCenter(item: TextItem): { x: number; y: number }`
2. Create `layout-mapping.ts`:
   - Import helpers + `PageData`, `TextItem`, `LayoutElement`
   - `applyFormulaElements(page: PageData, elements: LayoutElement[], dpi: number): void`
   - `applyTableElements(page: PageData, elements: LayoutElement[], dpi: number): void`
   - `applyLayoutElements(page: PageData, detection: LayoutDetection, dpi: number): void` — orchestrator that calls formula first then table, silently no-ops if detection empty or image dims zero
3. Define synthetic TextItem helper:
   ```ts
   function makeSynthetic(str: string, rect: Rect, extras: Partial<TextItem>): TextItem {
     return { str, x: rect.x, y: rect.y, width: rect.w, height: rect.h, w: rect.w, h: rect.h, fontName: "LAYOUT", ...extras };
   }
   ```
4. Tests (coordinates chosen to avoid floating-point ambiguity):
   - `imageBboxToPdf([150,300,450,600], 150)` → `{x:72,y:144,w:144,h:144}`
   - Formula removes 3 items whose centers lie inside; keeps 2 outside; injects 1 synthetic
   - Formula with empty latex → no-op
   - Table injects two markers, keeps all items
   - Nested formula-in-table: formulas replaced first, table still wraps correctly (including synthetic formula)
   - Empty elements → page unchanged (deep-equal)
   - dpi=300 vs 150 produce proportionally different PDF rects

## Todo List

- [ ] `layout-bbox.ts` helpers implemented
- [ ] `layout-mapping.ts` orchestrator + formula + table appliers implemented
- [ ] `TextItem` extended with `isFormula?`/`isTableMarker?`
- [ ] 10+ unit tests passing (listed above)
- [ ] Nested formula-in-table case explicitly covered
- [ ] Empty detection = no-op verified by deep-equal
- [ ] `tsc --noEmit` clean

## Success Criteria

- Unit tests green with ≥90% line coverage on `layout-mapping.ts` and `layout-bbox.ts`.
- Running integration (phase-04) produces `<formula>...</formula>` and `<table>...</table>` in output text at expected line positions.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Synthetic TextItems break grid projection (unexpected width/line grouping) | Med | High | Use realistic width = bbox width; place markers on dedicated lines via ε offset; add integration test in phase-04 |
| Center-in-bbox miss for short items straddling edges | Low | Med | Document as known-acceptable; 80/20 rule — most glyphs fully inside |
| DPI mismatch (server rendered at different DPI than parser expected) | Med | High | Always pass parser's `config.dpi` as source of truth; server does NOT rescale |
| TextItem field explosion (ever more flags) | Low | Low | YAGNI — only add `isFormula`/`isTableMarker`; reuse existing `fontName: "LAYOUT"` sentinel if needed |
| Nested formula-in-table duplication | Low | Med | Process formulas first; synthetic formula item is wrapped by table, not double-processed |

## Security Considerations

- LaTeX content is user-derived and placed directly in output text. Downstream consumers (markdown renderers, web UIs) must treat as untrusted. Add note in README that `<formula>` payload is raw LaTeX and may need sanitization.

## Next Steps

- Consumed by phase-04 (`parser.ts` calls `applyLayoutElements` after OCR, before grid projection).
