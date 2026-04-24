# Code Review: PaddleX Layout + Formula OCR Integration

## Scope
- Files: 16 (8 new TS, 3 new TS tests, 5 new Python, 1 new spec doc, modified: types.ts, config.ts, parser.ts, cli/parse.ts, lib.ts)
- LOC: ~750 new, ~30 modified
- Focus: recent (new feature)
- Scout findings: see below

## Overall Assessment

Well-structured opt-in feature. Clean separation between interface, HTTP client, coordinate helpers, and mapping logic. Follows existing codebase patterns (mirrors `HttpOcrEngine` design). Opt-in by default, no regressions possible. Build passes, all 20 new tests pass.

Key architectural strength: layout engine is a standalone `LayoutEngine` interface with a single HTTP implementation, matching the established `OcrEngine` pattern. Coordinate math is correct and DPI-consistent.

## Critical Issues

### C1. SSRF: No private-network/metadata endpoint validation (Security)

**File:** `src/engines/layout/http-layout-engine.ts:31-35`

The URL validation only checks the scheme (`http` or `https`). An attacker who can control `layoutServerUrl` (via config file, env var, or CLI argument in a shared environment) can target internal services:

```
layoutServerUrl: "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
layoutServerUrl: "http://localhost:6379/"  // Redis
layoutServerUrl: "http://internal-api:8080/admin/secrets"
```

The `axios.post` will send the full page image (potentially containing sensitive document content) as multipart form-data to arbitrary internal endpoints.

**Recommendation:** Add private IP/metadata endpoint validation:
```typescript
private static BLOCKED_HOSTS = [
  /^169\.254\./,          // link-local metadata
  /^10\./,                // private class A
  /^172\.(1[6-9]|2\d|3[01])\./,  // private class B
  /^192\.168\./,          // private class C
  /^127\./,               // loopback
  /^0\./,                 // null route
];

constructor(serverUrl: string) {
  if (!/^https?:\/\//.test(serverUrl)) {
    throw new Error(`layoutServerUrl must be http or https, got: ${serverUrl}`);
  }
  const parsed = new URL(serverUrl);
  if (HttpLayoutEngine.BLOCKED_HOSTS.some(r => r.test(parsed.hostname))) {
    throw new Error(`layoutServerUrl blocked: private/internal IP not allowed`);
  }
  this.serverUrl = serverUrl;
}
```

**Severity rationale:** If this URL is always admin-configured and never user-controllable, this is informational. If any user-provided input reaches `layoutServerUrl`, this is critical. The LAYOUT_API_SPEC.md already warns about deploying behind private networks, but client-side validation is defense-in-depth.

### C2. Potential PdfiumRenderer concurrency issue with WASM (Reliability)

**File:** `src/core/parser.ts:367-396`

`runLayout` calls `renderer.renderPageToBuffer` concurrently via `pLimit(numWorkers)` against a single `PdfiumRenderer` instance with a cached WASM document. PDFium's WASM module uses shared linear memory -- concurrent `getPage()` + `page.render()` calls may race on the shared `HEAPU8` buffer.

The `screenshot()` method (line 319-330) renders sequentially in a `for` loop, which avoids this problem. But `runLayout` uses `Promise.all` with `pLimit`.

**Recommendation:** Either:
1. Render pages sequentially (like `screenshot` does), or
2. Add a per-render mutex, or
3. Verify that `@hyzyla/pdfium`'s WASM module is concurrency-safe (document this assumption in a comment)

Option 1 is simplest:
```typescript
for (const page of pages) {
  try {
    const buf = await renderer.renderPageToBuffer(...);
    const det = await this.layoutEngine!.detect(buf);
    applyLayoutElements(page, det, this.config.dpi);
  } catch (e) { ... }
}
```

This trades parallelism for safety. The layout HTTP calls are the bottleneck anyway, not the rendering.

## High Priority

### H1. File path leaked in error log (Data Leak)

**File:** `src/engines/layout/http-layout-engine.ts:76-77`

```typescript
const label = typeof image === "string" ? image : "<buffer>";
```

When `image` is a file path string, the full local path is logged via `console.warn`. This is consistent with the existing `HttpOcrEngine` (line 63), so it matches established patterns, but worth noting for deployment environments where logs may be aggregated.

**Recommendation:** Consider basename only: `path.basename(image)`. Low urgency since this mirrors existing OCR behavior.

### H2. No file size limit on PaddleX server (DoS)

**File:** `ocr/paddlex-layout/server.py:53-54`

The server reads the entire uploaded file into memory with `await file.read()` with no size limit. A malicious client could send a multi-GB file to exhaust server memory.

The `LAYOUT_API_SPEC.md` mentions "Reject files larger than 20MB" under Security, but the server implementation does not enforce this.

**Recommendation:**
```python
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

image_data = await file.read(MAX_FILE_SIZE + 1)
if len(image_data) > MAX_FILE_SIZE:
    raise HTTPException(status_code=413, detail="File too large (max 20MB)")
```

### H3. ZeroDivisionError in normalize.py for degenerate polygons (Correctness)

**File:** `ocr/paddlex-layout/normalize.py:42-43`

If `poly` is `[[]]` (a list containing an empty list), `xs = []`, `len(xs) = 0`, and `sum(xs) / len(xs)` raises `ZeroDivisionError`. This would crash the entire layout pipeline for one malformed formula result.

```python
if isinstance(poly[0], list):
    cx = sum(xs) / len(xs)  # ZeroDivisionError if xs is empty
    cy = sum(ys) / len(ys)  # Same
```

**Recommendation:** Add guards:
```python
if isinstance(poly[0], list):
    if not xs or not ys:
        continue
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
```

## Medium Priority

### M1. Missing `response.data` validation for bbox shape (Correctness)

**File:** `src/engines/layout/http-layout-engine.ts:63-68`

The response mapping assumes `item.bbox` is a 4-element array, `item.type` is a string, and `item.confidence` is a number. No runtime validation. A malformed server response (e.g., `bbox: null`, `confidence: "high"`) would propagate silently into coordinate math, producing NaN values that corrupt the entire page's layout.

**Recommendation:** Add minimal validation:
```typescript
const elements: LayoutElement[] = data.layout
  .filter((item): item is LayoutResponseItem =>
    Array.isArray(item.bbox) && item.bbox.length === 4 &&
    typeof item.type === "string" && typeof item.confidence === "number"
  )
  .map(...)
```

### M2. Error log includes server response body (Data Leak)

**File:** `src/engines/layout/http-layout-engine.ts:59`

```typescript
console.warn("Layout server response missing layout array:", response.data);
```

The full `response.data` is logged, which may contain internal server details, stack traces, or PII if the server returns unexpected content.

**Recommendation:** Log only a summary:
```typescript
console.warn("Layout server response missing layout array (keys: %s)", Object.keys(response.data || {}).join(","));
```

### M3. No test for file-path input mode in HttpLayoutEngine (Testing)

**File:** `src/engines/layout/http-layout-engine.test.ts`

All tests use `Buffer.from("fake-png")` as input. The `typeof image === "string"` branch (line 42) that creates a `fs.createReadStream` is untested. This branch is used when `runLayout` renders pages via `PdfiumRenderer` (which returns a `Buffer`), so it's only relevant for standalone engine usage, but it's still dead code in the test suite.

### M4. `renderPageToBuffer` type cast is unnecessary

**File:** `src/core/parser.ts:379`

```typescript
const buf = await renderer.renderPageToBuffer(
  pdfInput as string | Buffer | Uint8Array,
  page.pageNum,
  this.config.dpi,
);
```

The `pdfInput` parameter is already typed as `string | Uint8Array` (line 361). The cast to include `Buffer` is misleading since `Buffer extends Uint8Array`, so `Buffer` is already a valid `Uint8Array`.

### M5. Table markers lack ordering guarantee relative to content items

**File:** `src/processing/layout-mapping.ts:89`

Table markers are simply appended to `page.textItems`. The grid projection sorts items by Y position, so the `<table>` marker (offset by `-TABLE_MARKER_EPSILON`) should appear before table content, and `</table>` (offset by `rect.h + TABLE_MARKER_EPSILON`) should appear after. However, if multiple tables overlap vertically by less than `TABLE_MARKER_EPSILON` (0.5 points), their markers could interleave incorrectly.

This is unlikely in practice but worth noting for edge cases with tightly packed tables.

### M6. `normalize.py` accesses `poly[0]` and `poly[1]` without length check

**File:** `ocr/paddlex-layout/normalize.py:39-40`

```python
xs = poly[0] if isinstance(poly[0], list) else [p[0] for p in poly]
```

If `poly` is an empty list `[]`, `poly[0]` raises `IndexError`. The `if not poly` guard on line 36 catches `None` and `[]` (both falsy), so this is safe for `[]`. But if `poly` is a numpy array with shape `(0, 2)`, `not poly` evaluates to `False` (numpy arrays are truthy), and `poly[0]` would raise an `IndexError`.

## Low Priority

### L1. `HttpLayoutEngine` uses `console.warn` while `HttpOcrEngine` uses `console.error`

**Files:** `src/engines/layout/http-layout-engine.ts:84` vs `src/engines/ocr/http-simple.ts:65`

Layout engine logs errors via `console.warn`; OCR engine uses `console.error`. Inconsistent log level for the same category of failure (HTTP server error). The layout engine's choice of `warn` is arguably better since failures are gracefully handled, but consistency would be nice.

### L2. Config `layoutEnabled: undefined` default is subtle

**File:** `src/core/config.ts:27`

```typescript
layoutEnabled: undefined, // true when url present, false only if explicitly set
```

The truth table for `layoutEnabled`:
- `undefined` + URL set = enabled (correct)
- `true` + URL set = enabled (correct)
- `false` + URL set = disabled (correct)
- `undefined` + no URL = disabled (correct)
- `true` + no URL = disabled (correct, no engine created)

This works correctly but the `undefined` default is subtle. A `true` explicit default with `!== false` check would be clearer. This is a style nit.

### L3. API spec says server should return 400 for invalid input, but test expects 500

**File:** `ocr/paddlex-layout/test_server.py:101-107`

```python
def test_rejects_non_image(client: TestClient):
    resp = client.post(...)
    assert resp.status_code == 500
```

The `LAYOUT_API_SPEC.md` specifies 400 for invalid input, but the test asserts 500. The server catches all exceptions and returns 500. A 400 would be more semantically correct for a non-image upload.

### L4. Test fixture creates mock but imports unused `normalize`

**File:** `ocr/paddlex-layout/test_server.py:55`

```python
from normalize import correlate_formula_latex

patched_normalize = normalize
```

`correlate_formula_latex` is imported but unused. `patched_normalize` is assigned but never referenced.

## Edge Cases Found by Scout

1. **Formula deduplication vs OCR overlap:** When layout detection removes text items inside a formula bbox, but OCR has already injected items for the same region, both the native text AND the OCR text may be removed. The OCR deduplication in `buildBbox` (bbox.ts) checks overlap against `pageData.textItems`, which at that point includes OCR items from `processPageOcr`. So if OCR text was already added inside the formula region, it will be correctly removed by the formula filter. This works correctly.

2. **Multiple formulas on same page with overlapping bboxes:** `applyFormulaElements` iterates formulas and removes overlapping text items sequentially. If two formulas overlap, the second formula's `pointInRect` check operates on already-filtered `textItems`. The second formula's synthetic item won't conflict with the first. This is correct but could lead to duplicate removal if a text item's center falls in both formula bboxes.

3. **Grid projection handles LAYOUT fontName:** The grid projection does not check `fontName` or `isFormula`/`isTableMarker` -- it processes all text items uniformly. Formula tags like `<formula>E=mc^2</formula>` will be treated as regular text in the grid. This is intentional (the tag content flows into the final text output). The `fontName: "LAYOUT"` is informational only.

## Positive Observations

1. **Clean interface design:** `LayoutEngine` interface mirrors `OcrEngine`, making the pattern discoverable and consistent.
2. **Graceful degradation:** Every failure mode returns empty results rather than throwing. Layout failures never block the parse pipeline.
3. **Opt-in by default:** `layoutServerUrl: undefined` in defaults. No regressions possible for existing users.
4. **DPI consistency:** Same `config.dpi` used for rendering, server communication, and coordinate conversion. No unit mismatch.
5. **Test coverage:** 20 tests covering success, error, malformed response, empty detection, formula/table interaction.
6. **API spec document:** `LAYOUT_API_SPEC.md` is comprehensive with coordinate system docs, security notes, and a compliance checklist.
7. **Python server uses FastAPI with Pydantic models:** Type-safe request/response handling.
8. **Dockerfile uses `uv` for reproducible builds.**

## Recommended Actions

1. **[Critical]** Add SSRF validation to `HttpLayoutEngine` constructor (C1) -- or document that URL must be admin-controlled if deferring.
2. **[Critical]** Verify or document PdfiumRenderer concurrency safety in `runLayout` (C2). Sequential rendering is safest.
3. **[High]** Add file size limit to `server.py` (H2).
4. **[High]** Add zero-division guard in `normalize.py` (H3).
5. **[Medium]** Add `bbox` array length validation in `http-layout-engine.ts` (M1).
6. **[Medium]** Avoid logging full `response.data` (M2).

## Metrics
- Type Coverage: 100% (all interfaces typed, no `any` escapes)
- Test Coverage: 16 new TS tests + 4 Python tests (20 total)
- Linting Issues: 1 unused import in Python test (L4)

## Unresolved Questions

1. Is `layoutServerUrl` ever user-controllable (e.g., from user-uploaded config files in a SaaS deployment)? If yes, SSRF mitigation is critical.
2. Is `@hyzyla/pdfium`'s WASM module safe for concurrent `getPage` + `render` calls on a shared document? The `screenshot` method avoids this by using sequential rendering, but `runLayout` does not.
3. Should the JSON output (`JsonTextItem`) include `isFormula` / `isTableMarker` flags so API consumers can distinguish layout-injected items from native text? Currently these fields are stripped by `formatJSON`.
