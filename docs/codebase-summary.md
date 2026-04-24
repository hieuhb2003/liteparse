# Codebase Summary

**Last Updated**: 2026-04-23
**Version**: 1.5.2
**Repository**: https://github.com/run-llama/liteparse

## Overview

LiteParse is an open-source PDF parsing library with spatial text extraction, OCR integration, and bounding box tracking. Built with TypeScript, it provides a pluggable engine architecture supporting multiple PDF extraction backends (PDF.js, PDFium) and OCR engines (Tesseract.js, HTTP). The library supports CLI usage, Node.js imports, and Python SDK wrapping.

## Project Structure

```
liteparse/
├── src/
│   ├── engines/                    # Pluggable engine interfaces & implementations
│   │   ├── pdf/
│   │   │   ├── interface.ts       # PdfEngine contract
│   │   │   ├── pdfjs.ts           # PDF.js v5 implementation (937 LOC)
│   │   │   ├── pdfium-renderer.ts # WASM-based renderer (201 LOC)
│   │   │   └── pdfjsImporter.ts   # DOM polyfills
│   │   └── ocr/
│   │       ├── interface.ts       # OcrEngine contract
│   │       ├── tesseract.ts       # Tesseract.js with workers (212 LOC)
│   │       └── http-simple.ts     # HTTP OCR client (85 LOC)
│   ├── processing/                # Text extraction & layout algorithms
│   │   ├── gridProjection.ts      # Spatial reconstruction (2249 LOC)
│   │   ├── bbox.ts                # Native+OCR fusion (333 LOC)
│   │   ├── cleanText.ts           # Margin removal (88 LOC)
│   │   ├── textUtils.ts           # Unicode conversion (151 LOC)
│   │   ├── ocrUtils.ts            # OCR result parsing (109 LOC)
│   │   ├── markupUtils.ts         # Annotation markup (31 LOC)
│   │   ├── searchItems.ts         # Phrase search (96 LOC)
│   │   ├── grid.ts                # Wrapper
│   │   └── gridDebugLogger.ts     # Debug logging (642 LOC)
│   ├── output/
│   │   ├── json.ts                # Structured JSON output
│   │   └── text.ts                # Plain text output
│   ├── conversion/
│   │   └── convertToPdf.ts        # Multi-format→PDF (514 LOC)
│   ├── core/
│   │   ├── types.ts               # Interfaces (LiteParseConfig, ParseResult, etc.)
│   │   └── parser.ts              # Main Parser class (495 LOC)
│   ├── index.ts                   # CLI entry
│   └── lib.ts                     # Public API exports
├── cli/
│   └── parse.ts                   # Commander.js CLI implementation
├── packages/
│   └── python/
│       ├── liteparse/             # Python SDK (v1.2.1)
│       └── pyproject.toml         # Python packaging
├── ocr/
│   ├── easyocr-server/            # FastAPI EasyOCR service (port 8828)
│   └── paddleocr-server/          # FastAPI PaddleOCR service (port 8829)
├── docs/                          # Project documentation
├── tests/                         # Vitest test suite
├── package.json                   # v1.5.2, TypeScript
├── tsconfig.json                  # ES2022, strict mode
├── vitest.config.ts               # 30s timeout, v8 coverage
└── README.md                      # Quick start & API examples
```

## Core Technologies

**Runtime & Language**:
- TypeScript ES2022, strict mode
- Node.js >= 14 (recommend 18+)
- ESM modules

**PDF Processing**:
- pdf-parse (text extraction)
- pdfjs-dist (PDF.js v5)
- @hyzyla/pdfium (WASM renderer)

**OCR**:
- tesseract.js v7 (browser/Node.js)
- HTTP client to external servers

**Utilities**:
- axios (HTTP client)
- sharp (image processing)
- commander (CLI parsing)
- zod (schema validation)
- p-limit (worker pools)

**Development**:
- Vitest (test runner, 30s timeout)
- TypeScript compiler
- v8 (coverage reporting)

## Key Components

### 1. PDF Engine Layer (`src/engines/pdf/`)

**PdfEngine Interface**:
- `loadDocument(pdf)` → document handle
- `extractPage(page)` → PageData {textItems, images}
- `extractAllPages()` → PageData[] (all pages)
- `renderPageImage(page, dpi)` → image buffer
- `close()` → cleanup

**PDF.js Implementation** (937 LOC):
- Font corruption handling: Adobe Glyph Map, Windows-1252 fallback
- Ligature decomposition (fi → f+i, ffi → f+f+i)
- Coordinate transformation matrices
- Garbled text region detection

**PDFium Renderer** (201 LOC):
- WASM-based high-quality screenshots
- Embedded image extraction

### 2. OCR Engine Layer (`src/engines/ocr/`)

**OcrEngine Interface**:
- `recognize(image, lang)` → OcrResult {text, bbox, confidence}
- `recognizeBatch(images, lang)` → OcrResult[]

**Tesseract.js** (212 LOC):
- Worker pool (lazy init, configurable size)
- Language fallback (normalize names: eng→eng, chi_sim→chi_sim)
- Browser/Node.js compatibility

**HTTP Client** (85 LOC):
- Multipart/form-data upload
- 60-second timeout
- Standard response format: {results: [{text, bbox, confidence}]}

### 3. Processing Pipeline (`src/processing/`)

**Grid Projection** (2249 LOC - core algorithm):
- Reconstructs spatial layout from raw PDF text
- Handles multi-column, rotated, subscript/superscript text
- Anchor-based positioning, flowing text detection
- Output: word-level coordinate mapping

**Bounding Box Fusion** (333 LOC):
- Combines native PDF coordinates + OCR results
- Multi-stage filtering: overlap removal, deduplication, confidence >= 0.1
- Result: {text, bbox, confidence, source} for each element

**Text Utilities**:
- Unicode subscript/superscript conversion (textUtils.ts, 151 LOC)
- OCR table artifact cleanup
- Margin removal, null-character cleanup (cleanText.ts, 88 LOC)
- Phrase search with bbox merging (searchItems.ts, 96 LOC)

**Debug Logging** (642 LOC):
- Comprehensive grid projection tracing
- Configurable filters, output formatting

### 4. Output Formats (`src/output/`)

**JSON Output** (`json.ts`):
- Structured: {pages: [{items, metadata}], boundingBoxes, summary}
- Item format: {text, bbox, confidence, page, position}

**Text Output** (`text.ts`):
- Plain text with "--- Page N ---" separators
- Preserves approximate spatial ordering

### 5. Format Conversion (`src/conversion/`)

**convertToPdf.ts** (514 LOC):
- DOCX, PPTX, XLSX → PDF via LibreOffice subprocess
- Images (PNG, JPG, etc.) → PDF via ImageMagick
- Subprocess isolation, 2-minute timeout per file
- LITEPARSE_TMPDIR env support for custom temp dir

### 6. Core Parser (`src/core/parser.ts`, 495 LOC)

**LiteParseConfig** (types.ts):
```typescript
{
  ocrLanguage?: string           // 'en', 'chi_sim', etc.
  ocrEnabled?: boolean           // true by default
  ocrServerUrl?: string          // external HTTP server
  tessdataPath?: string          // custom Tesseract data
  numWorkers?: number            // CPU-1 default
  maxPages?: number              // 10000 default
  targetPages?: string           // '1-5,10' page range
  dpi?: number                   // 150 default
  outputFormat?: 'text' | 'json' // 'text' default
  preciseBoundingBox?: boolean   // true default
  preserveSmallText?: boolean    // false default
  password?: string              // PDF password
}
```

**Parser Class**:
- Constructor: merges config, initializes engines (PdfJsEngine default, auto-selects OCR)
- `parse(input, quiet)` → ParseResult {text, json, pages}
- `screenshot()` → image buffers

**ParseResult**:
```typescript
{
  text: string
  json: {pages, boundingBoxes, summary}
  pages: PageContent[]
  metadata: {fileName, totalPages, format}
}
```

### 7. CLI Interface (`cli/parse.ts`, `src/index.ts`)

**Commands**:
- `parse <file>` - Extract text/JSON from file
- `batch-parse <dir>` - Parallel processing with --num-workers
- `screenshot <file>` - Generate page images

**Key Options**:
- `--format json|text`
- `--ocr-server-url <url>`
- `--no-ocr` - Disable OCR
- `--target-pages "1-5,10"`
- `--num-workers <n>`
- `--max-pages <n>`
- `--dpi <n>`
- `--config <file>`
- `--password <pwd>`

**Installation**:
- `npm i -g @llamaindex/liteparse`
- `brew install llamaindex-liteparse`

### 8. Python SDK (`packages/python/liteparse/`)

**v1.2.1** - Wraps Node CLI via subprocess

**Methods**:
- `parse(file, **kwargs)` → ParseResult
- `parse_async(file, **kwargs)` → awaitable
- `batch_parse(dir, **kwargs)` → List[ParseResult]
- `screenshot(file, **kwargs)` → List[bytes]

**Types**:
- ParseResult, ParsedPage, TextItem, BoundingBox, ScreenshotBatchResult
- Pydantic models for validation

## Entry Points

### For Users
- **README.md**: Quick start, API examples, Docker setup
- **Interactive API Docs**: Swagger at `/docs` (FastAPI, if using OCR servers)

### For Developers
- **src/index.ts**: CLI bootstrap
- **src/lib.ts**: Public library exports
- **src/core/parser.ts**: Main Parser class
- **src/engines/**: Engine interfaces & implementations
- **src/processing/**: Text extraction & layout logic

### Configuration
- **tsconfig.json**: ES2022, strict, ESM
- **vitest.config.ts**: 30s timeout, v8 coverage
- **package.json**: Dependencies, build scripts

## Development Principles

**YAGNI** (You Aren't Gonna Need It): Only implement what's needed now

**KISS** (Keep It Simple, Stupid): Prefer straightforward solutions

**DRY** (Don't Repeat Yourself): Eliminate duplication via shared utilities

**Error Handling**: Try-catch all external calls (APIs, file I/O), provide meaningful errors

**Async-First**: Use async/await for I/O, worker pools for parallelism

## Testing Strategy

**Test Framework**: Vitest
- 30-second timeout per test
- v8 coverage reporting
- Node environment

**Coverage Targets**:
- > 80% overall code coverage
- Error scenarios tested
- Cross-platform validation (Windows, macOS, Linux)

## File Statistics

**Source Files**: 30+ TypeScript modules

**Key Module Sizes**:
- `processing/gridProjection.ts` (2249 LOC)
- `engines/pdf/pdfjs.ts` (937 LOC)
- `core/parser.ts` (495 LOC)
- `conversion/convertToPdf.ts` (514 LOC)
- `processing/gridDebugLogger.ts` (642 LOC)
- `engines/ocr/tesseract.ts` (212 LOC)
- `engines/pdf/pdfium-renderer.ts` (201 LOC)

**Configuration**:
- `package.json` (v1.5.2)
- `tsconfig.json` (ES2022, strict)
- `vitest.config.ts` (node env)
- `.env.example` (optional OCR config)

## Critical Files to Know

**Configuration**:
- `src/core/types.ts` - LiteParseConfig, ParseResult, all interfaces
- `package.json` - Dependencies, version
- `.env.example` - Optional OCR server URLs

**Ingestion**:
- `src/core/parser.ts` - Main entry point
- `src/engines/pdf/pdfjs.ts` - Default PDF extraction
- `src/processing/gridProjection.ts` - Spatial layout reconstruction
- `src/processing/bbox.ts` - Native+OCR fusion

**Output**:
- `src/output/json.ts` - JSON formatting
- `src/output/text.ts` - Text formatting

**CLI**:
- `src/index.ts` - Bootstrap
- `cli/parse.ts` - Commander.js commands

**Python**:
- `packages/python/liteparse/main.py` - SDK wrapper

## Integration Capabilities

**External APIs**:
- PDF.js (npm package, browser/Node)
- Tesseract.js (npm package, browser/Node)
- EasyOCR/PaddleOCR servers (HTTP, custom)
- LibreOffice (subprocess, format conversion)
- ImageMagick (subprocess, image processing)

**Supported Input Formats**:
- PDF (native)
- DOCX, XLSX, PPTX (via LibreOffice conversion)
- PNG, JPG, GIF, BMP (via ImageMagick conversion)
- TXT (plain text with fallback)

**Output Formats**:
- Text (plain, with page separators)
- JSON (structured, with bounding boxes)
- Coordinates (per-word bounding boxes)

**Extensibility Points**:
- **New PDF engines**: Implement PdfEngine interface
- **New OCR engines**: Implement OcrEngine interface
- **Custom conversion**: Extend convertToPdf or add new format handler
- **Custom post-processing**: Chain processing functions

## Version & License

**Current**: v1.5.2 (2026-04-23)
**License**: MIT (open source)
**Author**: LlamaIndex team (original contributors in GitHub history)

## Known Limitations

1. **PDF.js Font Corruption**: Not all corrupted fonts recoverable (OCR fallback helps)
2. **Large PDFs**: Memory-constrained for 500+ pages without batching
3. **OCR Accuracy**: Domain-specific OCR requires fine-tuning (not bundled)
4. **Incremental Updates**: Full document re-ingestion required (no delta parsing)
5. **Real-Time**: No streaming parser (loads full document to memory)

## Unresolved Questions

1. Should we support Rust/C++ native engines for performance?
2. How to optimize spatial layout for 100+ column layouts?
3. Should we provide pre-trained OCR models for specific domains?
4. Can streaming parser preserve bounding box accuracy?
