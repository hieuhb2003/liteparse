# System Architecture

**Last Updated**: 2026-04-23
**Version**: 1.5.2
**Project**: LiteParse PDF Parser

## Architectural Overview

LiteParse implements a **pluggable engine architecture** for PDF extraction with spatial text reconstruction. Key design:
- **PDF Engine Layer**: Abstract interface with PDF.js (default) and PDFium (WASM) implementations
- **OCR Engine Layer**: Abstract interface with Tesseract.js and HTTP-based implementations
- **Processing Pipeline**: Grid projection algorithm reconstructs spatial layout
- **Output Layer**: JSON (structured) and text (plain) formatters

## Core Design Patterns

**Strategy Pattern**: Multiple PDF engines, multiple OCR engines, multiple output formats

**Factory Pattern**: Engine selection based on config (PDF engine, OCR engine)

**Chain of Responsibility**: Text extraction → Layout projection → OCR fusion → Output formatting

**Graceful Degradation**: OCR failure → native text; Missing bounding box → text only

## System Components

### 1. PDF Engine Layer (`src/engines/pdf/`)

**PdfEngine Interface**:
```typescript
interface PdfEngine {
  loadDocument(pdf: Buffer | string): Promise<PdfDocument>;
  extractPage(page: PdfPage): Promise<PageData>;
  extractAllPages(): Promise<PageData[]>;
  renderPageImage(page: number, dpi: number): Promise<Buffer>;
  close(): Promise<void>;
}

interface PageData {
  textItems: TextItem[];
  images: Image[];
  garbledTextRegions?: BoundingBox[];
}
```

**PDF.js Implementation** (937 LOC):
- Font corruption detection (Adobe Glyph Map, Windows-1252 fallback)
- Ligature decomposition (fi → f+i)
- Coordinate transformation matrices
- Cross-platform (Node.js, browser)

**PDFium Renderer** (201 LOC):
- WASM-based high-quality screenshots
- Embedded image extraction
- Rotation/scaling support

### 2. OCR Engine Layer (`src/engines/ocr/`)

**OcrEngine Interface**:
```typescript
interface OcrEngine {
  recognize(image: Buffer, language: string): Promise<OcrResult>;
  recognizeBatch(images: Buffer[], language: string): Promise<OcrResult[]>;
}

interface OcrResult {
  text: string;
  bbox: [x1, y1, x2, y2];
  confidence: number;
}
```

**Tesseract.js** (212 LOC):
- Worker pool (lazy init, configurable size)
- Language support (100+ languages)
- Browser/Node.js compatible

**HTTP Client** (85 LOC):
- Multipart/form-data upload
- 60-second timeout
- Standard format: {results: [{text, bbox, confidence}]}

### 3. Processing Pipeline (`src/processing/`)

**Grid Projection** (2249 LOC - core algorithm):
- Transforms raw PDF text items → spatially-reconstructed text
- Handles multi-column, rotated, subscript/superscript
- Anchor-based positioning, flowing text detection
- Output: word-level spatial grid with coordinates

**Bounding Box Fusion** (333 LOC):
- Combines native PDF coordinates + OCR results
- Multi-stage filtering: overlap removal, deduplication, confidence ≥ 0.1
- Confidence-weighted merging
- Result: {text, bbox, confidence, source} per element

**Text Utilities** (151 + 88 + 109 LOC):
- Unicode subscript/superscript conversion
- OCR table artifact cleanup
- Margin removal, null-character removal
- Phrase search with bbox merging

### 4. Output Layer (`src/output/`)

**JSON Formatter** (`json.ts`):
- Structured output: {pages, boundingBoxes, summary}
- Item schema: {text, bbox, confidence, page, position}
- Metadata: fileName, totalPages, format

**Text Formatter** (`text.ts`):
- Plain text with "--- Page N ---" separators
- Preserves approximate spatial ordering

### 5. Format Conversion (`src/conversion/convertToPdf.ts`, 514 LOC)

**Multi-Format Support**:
- DOCX, PPTX, XLSX → PDF (LibreOffice subprocess)
- Images (PNG, JPG, etc.) → PDF (ImageMagick subprocess)
- Subprocess isolation, 2-minute timeout per file
- LITEPARSE_TMPDIR env support

### 6. Core Parser (`src/core/parser.ts`, 495 LOC)

**Constructor**:
- Merges config with defaults
- Initializes PdfJsEngine (default)
- Auto-selects OCR engine (HttpOcrEngine if ocrServerUrl, else TesseractEngine)
- Validates config via Zod schema

**Key Methods**:
- `parse(input, quiet)` → ParseResult {text, json, pages}
- `screenshot()` → image buffers

## Data Flow Diagrams

### Document Ingestion Flow

```
Input PDF/DOCX/Image
       ↓
convertToPdf (if needed)
  → LibreOffice/ImageMagick subprocess
       ↓
PdfEngine.loadDocument()
       ↓
PdfEngine.extractAllPages() (iterate pages)
       ↓
For each page:
  ├─ TextItem[] (native)
  ├─ Image[] (embedded)
  └─ GarbledRegions[] (detected)
       ↓
buildBbox():
  ├─ Native coordinates
  ├─ OCR recognition (if enabled)
  └─ Confidence-weighted fusion
       ↓
projectPagesToGrid():
  ├─ Grid projection algorithm
  ├─ Spatial layout reconstruction
  └─ Multi-column/rotation handling
       ↓
cleanRawText():
  ├─ Margin removal
  ├─ Null-char cleanup
  └─ Unicode conversion
       ↓
ParseResult {text, json, pages}
```

### Text Extraction Pipeline

```
Raw TextItem[]
       ↓
Grid Projection:
  ├─ Anchor-based positioning
  ├─ Multi-column detection
  ├─ Rotation handling
  ├─ Subscript/superscript conversion
  └─ Flowing text detection
       ↓
BBox Fusion (native + OCR):
  ├─ Overlap detection (0.8+ threshold)
  ├─ Deduplication
  ├─ Confidence-weighted merging
  └─ Confidence filter (≥ 0.1)
       ↓
Text Cleaning:
  ├─ Margin removal
  ├─ Null-character cleanup
  ├─ Ligature decomposition
  └─ Unicode normalization
       ↓
Output:
  ├─ Text (plain)
  ├─ JSON (structured with coordinates)
  └─ Metadata (summary, pages)
```

## Technology Stack

**Runtime**:
- TypeScript ES2022, strict mode, ESM
- Node.js >= 14 (recommend 18+)
- Python 3.8+ (SDK wrapper via subprocess)

**Core Dependencies**:
- pdf-parse (text extraction)
- pdfjs-dist v5 (PDF.js)
- @hyzyla/pdfium (WASM renderer)
- tesseract.js v7 (OCR)
- axios (HTTP)
- sharp (image processing)
- commander (CLI)
- zod (validation)
- p-limit (worker pools)

**Development**:
- Vitest (test runner, 30s timeout)
- TypeScript compiler (strict)
- v8 (coverage reporting)

## Integration Points

### External Services

**Tesseract.js** (npm package):
- Browser/Node.js compatible
- Worker pool for parallelism
- 100+ language support

**HTTP OCR Servers**:
- EasyOCR (port 8828): FastAPI, multipart/form-data
- PaddleOCR (port 8829): FastAPI, multipart/form-data
- Custom servers with standard API format

**LibreOffice** (subprocess):
- DOCX, PPTX, XLSX → PDF conversion
- Isolated subprocess with 2-minute timeout

**ImageMagick** (subprocess):
- Image → PDF conversion (PNG, JPG, etc.)
- Isolated subprocess

### CLI Entry Points

**index.ts** → `cli/parse.ts` (Commander.js):
- Commands: `parse`, `batch-parse`, `screenshot`
- Install: `npm i -g @llamaindex/liteparse`

**Python SDK** (`packages/python/liteparse/`):
- Wraps Node CLI via subprocess calls
- Typed responses: ParseResult, TextItem, BoundingBox

## Processing Configuration

**LiteParseConfig** (`src/core/types.ts`):
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

## Error Handling & Fallbacks

**OCR Failure**:
- Native text extraction succeeds → use native
- OCR optional → graceful degradation

**Missing Bounding Boxes**:
- PDFs without coordinate data → text-only output
- No impact on downstream processing

**Large PDFs**:
- Page batching prevents memory exhaustion
- Configurable page batch size (default: all)
- --max-pages CLI limit for safety

**Subprocess Failures** (conversion):
- 2-minute timeout per file
- Meaningful error messages
- Input validation before launch

## Performance Characteristics

**PDF Parse Latency**:
- 10 pages: < 5 seconds (native)
- 100 pages: 30-60 seconds (native + OCR)
- With batching: linear scaling to page count

**Memory Usage**:
- 10 pages: < 50MB
- 100 pages: 100-200MB
- 1000+ pages: requires batching

**Parallelism**:
- Worker pool: CPU-1 workers (configurable)
- Batch mode: 100 files/hour throughput

## Security Architecture

### Input Validation

- File type validation (PDF, DOCX, etc.)
- File size limits (prevent DoS)
- Path traversal prevention
- Zod schema validation for config

### Subprocess Isolation

- LibreOffice/ImageMagick run in isolated processes
- 2-minute timeout enforced
- Temporary files cleaned up
- No shell interpretation of paths

### Sensitive Data Handling

- No logging of file contents
- API keys via environment variables
- Password handling: in-memory, never logged

## Extensibility

### Adding PDF Engines

1. Implement PdfEngine interface
2. Add to engine factory in parser.ts
3. Register in CLI options

### Adding OCR Engines

1. Implement OcrEngine interface
2. Add to engine factory
3. Update language support

### Custom Output Formats

1. Extend output interface
2. Implement formatter
3. Add to output factory

## Deployment Architecture

**Development**:
- Local Node.js + Vitest
- Optional: local OCR server (Docker)

**Production**:
- CLI via npm global install or Homebrew
- Python SDK via pip
- OCR servers: self-hosted or external

**Scalability**:
- Horizontal: parallel workers (p-limit)
- Vertical: page batching for large PDFs
- Batch processing: 100+ files in parallel

## Testing Strategy

**Unit Tests**:
- Individual engines (PDF, OCR)
- Processing functions (grid projection, bbox fusion)
- Output formatters

**Integration Tests**:
- Full parse pipeline (PDF → text)
- Multi-format conversion
- Error recovery

**Coverage**:
- > 80% code coverage target
- v8 coverage reporting
- 30-second timeout per test

## Known Limitations

1. **Font Corruption**: Not all corrupted fonts fully recoverable
2. **Large PDFs**: Memory-constrained without batching
3. **Streaming**: Full document loaded to memory
4. **Incremental**: No delta parsing (requires full re-ingestion)
5. **OCR Accuracy**: Domain-specific tuning not included

## Future Evolution

**Semantic Chunking**: LLM-detected topic boundaries (not size-based)

**Hierarchical Parents**: Parent of parents for very long documents

**Hybrid Search**: Keyword + semantic search combination

**Multi-Modal**: Image embeddings alongside text

## References

### Internal Docs
- [Codebase Summary](./codebase-summary.md)
- [Code Standards](./code-standards.md)
- [Project Overview PDR](./project-overview-pdr.md)

### External Resources
- [PDF.js Docs](https://mozilla.github.io/pdf.js/)
- [Tesseract.js](https://github.com/naptha/tesseract.js)
- [Qdrant Vector DB](https://qdrant.tech/)
