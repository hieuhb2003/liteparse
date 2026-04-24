# LiteParse Layout API Specification

This document defines the HTTP API that layout detection servers must implement to work with LiteParse.

## Overview

LiteParse expects an HTTP endpoint that accepts a page image and returns detected layout elements (formulas, tables, text blocks, etc.) with bounding boxes and optional metadata like LaTeX for formulas. Your layout server can use any detection engine (PaddleX, DocTR, custom models) as long as it conforms to this API.

## Endpoint

```
POST /layout
```

## Request Format

**Content-Type:** `multipart/form-data`

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | binary | Yes | Page image (PNG, JPG) |
| `threshold` | float | No | Minimum confidence threshold (default: server-defined, typically 0.5) |

## Response Format

**Content-Type:** `application/json`

**Structure:**

```json
{
  "image_width": 1654,
  "image_height": 2339,
  "layout": [
    {
      "type": "formula",
      "bbox": [100, 200, 500, 280],
      "confidence": 0.95,
      "latex": "E=mc^2"
    },
    {
      "type": "table",
      "bbox": [50, 400, 800, 700],
      "confidence": 0.88
    },
    {
      "type": "text",
      "bbox": [50, 100, 800, 180],
      "confidence": 0.76
    }
  ]
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `image_width` | number | Width of the source image in pixels |
| `image_height` | number | Height of the source image in pixels |
| `layout` | array | Array of detected layout elements |
| `layout[].type` | string | Element type: `formula`, `table`, `text`, `title`, `figure`, `figure_title`, `table_title`, `header`, `footer`, `reference`, `abstract` |
| `layout[].bbox` | [number, number, number, number] | Bounding box `[x1, y1, x2, y2]` — top-left to bottom-right, in pixels |
| `layout[].confidence` | number | Detection confidence between 0.0 and 1.0 |
| `layout[].latex` | string | **Optional.** LaTeX string for formula elements |

## Example

### Request

```bash
curl -X POST http://localhost:8830/layout \
  -F "file=@page.png" \
  -F "threshold=0.5"
```

### Response

```json
{
  "image_width": 1654,
  "image_height": 2339,
  "layout": [
    {
      "type": "formula",
      "bbox": [300, 500, 700, 560],
      "confidence": 0.93,
      "latex": "\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
    },
    {
      "type": "table",
      "bbox": [100, 800, 1500, 1200],
      "confidence": 0.91
    }
  ]
}
```

## Error Handling

Return appropriate HTTP status codes:

- `200 OK` - Success
- `400 Bad Request` - Invalid request (missing file, corrupt image)
- `500 Internal Server Error` - Detection pipeline failed

Error response format:

```json
{
  "error": "Description of the error"
}
```

## Health Check

```
GET /health
```

Returns:

```json
{"status": "healthy"}
```

## Implementation Notes

### Coordinate System

- Origin (0,0) is at the **top-left** of the image
- X increases to the right, Y increases downward
- All coordinates are in **pixels at the source image resolution**
- LiteParse converts to PDF points (72 DPI) internally

### Critical: Coordinate Preservation

Layout servers MUST NOT rotate, warp, or otherwise transform the input image. If using PaddleX, always set:

```python
pipeline.predict(
    input=image,
    use_layout_detection=True,
    use_doc_orientation_classify=False,  # MUST be False
    use_doc_unwarping=False,             # MUST be False
)
```

These flags prevent coordinate drift between the input image and detected bounding boxes.

### Confidence Scores

- Normalize to range 0.0 to 1.0
- LiteParse filters by the `threshold` parameter or a sensible default (0.5)
- If your engine doesn't provide confidence, use `1.0`

### Formula LaTeX

- Only `type: "formula"` elements should include the `latex` field
- LaTeX should be a valid inline expression (no delimiters like `$` or `$$`)
- If formula recognition fails for a detected formula region, omit the `latex` field or return an empty string

### Layout Types

Standard types recognized by LiteParse:

| Type | Description | LiteParse Handling |
|------|-------------|-------------------|
| `formula` | Mathematical formula | Replaced with `<formula>LATEX</formula>` tag |
| `table` | Table region | Wrapped with `<table>...</table>` tags |
| `text` | Regular text block | Returned but not specially processed |
| `title` | Section/paragraph title | Returned but not specially processed |
| Other | Any other type | Returned as-is for extensibility |

## Security

- Deploy behind a private network or reverse proxy with authentication
- Reject files larger than 20MB
- Never log image content; log only dimensions and element counts
- LaTeX content is untrusted — downstream consumers must sanitize before rendering

## Example Implementation

See `ocr/paddlex-layout/` for a reference implementation using PaddleX formula recognition pipeline.

## Testing Your Server

```bash
# Start server
cd ocr/paddlex-layout && python server.py

# Test health
curl http://localhost:8830/health

# Test layout detection
curl -X POST http://localhost:8830/layout \
  -F "file=@test-page.png" | jq .

# Use with LiteParse
lit parse document.pdf --layout-server-url http://localhost:8830/layout
```

## FAQ

### Q: Should I resize the input image?

No. Return bounding boxes in the original image coordinates. LiteParse needs pixel-accurate mapping.

### Q: What if no elements are detected?

Return `{"image_width": W, "image_height": H, "layout": []}`.

### Q: Can I return elements not in the standard type list?

Yes. LiteParse passes through all element types but only specially processes `formula` and `table`.

### Q: Should I batch multiple pages?

No. LiteParse sends one image per request and manages concurrency client-side.

## Compliance Checklist

- [ ] Accepts `POST /layout` endpoint
- [ ] Accepts `file` form field (required) and `threshold` (optional)
- [ ] Returns JSON with `image_width`, `image_height`, and `layout` array
- [ ] Each layout item has `type`, `bbox`, and `confidence`
- [ ] Formula items include `latex` field
- [ ] Bounding boxes in `[x1, y1, x2, y2]` pixel format
- [ ] Coordinates match input image (no rotation/warping)
- [ ] Confidence normalized to 0.0–1.0
- [ ] Returns 200 on success, 400/500 on errors
- [ ] `GET /health` endpoint returns healthy status
