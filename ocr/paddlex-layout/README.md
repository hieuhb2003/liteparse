# PaddleX Layout Server for LiteParse

Layout detection and formula recognition server using PaddleX `formula_recognition` pipeline.

## Prerequisites

- Python 3.12+
- PaddlePaddle (auto-installed via uv)

## Install

```bash
cd ocr/paddlex-layout
uv sync
```

## Run

```bash
python server.py
```

Server starts on port **8830**.

## API

### POST /layout

Accepts a page image and returns detected layout elements.

```bash
curl -F "file=@page.png" http://localhost:8830/layout
```

Response:

```json
{
  "image_width": 1654,
  "image_height": 2339,
  "layout": [
    {"type": "formula", "bbox": [100, 200, 500, 280], "confidence": 0.95, "latex": "E=mc^2"},
    {"type": "table", "bbox": [50, 400, 800, 700], "confidence": 0.88}
  ]
}
```

### GET /health

Returns `{"status": "healthy"}`.

## Test

```bash
pytest
```

## Use with LiteParse

```bash
lit parse document.pdf --layout-server-url http://localhost:8830/layout
```

See [LAYOUT_API_SPEC.md](../../LAYOUT_API_SPEC.md) for full API specification.
