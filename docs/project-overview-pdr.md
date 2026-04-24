# Project Overview & Product Development Requirements (PDR)

**Project Name**: LiteParse
**Version**: 1.5.2
**Last Updated**: 2026-04-23
**Status**: Active Maintenance & Enhancement
**Repository**: https://github.com/run-llama/liteparse

## Executive Summary

LiteParse is an open-source, production-grade PDF parsing library providing advanced spatial text extraction, optical character recognition (OCR), and precise bounding box tracking. Built with a pluggable engine architecture, it supports multiple PDF extraction backends (PDF.js, PDFium), multiple OCR engines (Tesseract.js, HTTP-based servers), and multi-format input conversion.

## Project Purpose

### Vision
Provide accurate, developer-friendly PDF parsing with rich spatial information enabling reliable document extraction for AI/ML pipelines, data ingestion, and document processing applications.

### Mission
Deliver a PDF parsing library that:
- Extracts text with precise spatial location (bounding boxes)
- Handles corrupted/rotated text and complex layouts robustly
- Supports multiple PDF extraction engines (pluggable architecture)
- Integrates OCR for scanned/image-heavy PDFs
- Works across platforms (Node.js, Python) with consistent APIs

### Value Proposition
- **Accurate Spatial Extraction**: Native coordinates + OCR fusion with deduplication
- **Robust Font Handling**: Adobe Glyph Map, ligature decomposition, corruption detection
- **Multi-Engine Flexibility**: PDF.js (default), PDFium (WASM), Tesseract/HTTP OCR
- **Multi-Format Support**: Convert DOCX, PPTX, XLSX, images to PDF first, then parse
- **Production Ready**: Comprehensive error handling, batch processing, worker pools

## Target Users

### Primary Users
1. **ML/AI Engineers**: Building document ingestion pipelines with structured output
2. **Document Processing Startups**: Extracting data from diverse PDF sources
3. **Enterprise Integration Teams**: Migrating from legacy OCR systems
4. **Open-Source Projects**: Needing reliable PDF parsing without closed-source deps
5. **RAG/Vector Search Systems**: Feeding embeddings with accurate text + metadata

### User Personas

**Persona 1: ML Engineer Building RAG System**
- **Needs**: Accurate text extraction with page/section metadata for retrieval
- **Pain Points**: Font corruption, layout confusion, OCR accuracy trade-offs
- **Solution**: LiteParse handles corruption robustly, tracks bounding boxes for context

**Persona 2: Document Processing Startup**
- **Needs**: Handle DOCX, PPTX, XLSX, images + PDFs in single pipeline
- **Pain Points**: Multiple tools, format-specific quirks, deployment complexity
- **Solution**: Unified multi-format API, pluggable engines, subprocess isolation

**Persona 3: Enterprise IT**
- **Needs**: Replace expensive OCR vendors, maintain control over data
- **Pain Points**: High licensing costs, vendor lock-in, poor accuracy on domain docs
- **Solution**: Open-source, on-premise deployment, customizable OCR engines

## Key Features & Capabilities

### 1. Pluggable Engine Architecture

**PDF Extraction Engines**:
- **PDF.js** (default): Robust, cross-platform, font corruption handling (Adobe Glyph Map, Windows-1252)
- **PDFium** (WASM): High-quality screenshots, embedded image extraction
- Extensible interface for custom engines

**OCR Engines**:
- **Tesseract.js**: Browser/Node.js compatible, lazy initialization, worker pooling
- **HTTP-based**: Connect to EasyOCR, PaddleOCR, or custom servers
- Language support: 100+ languages, configurable

**Multi-Format Support**:
- **Direct**: PDF (native)
- **Conversion**: DOCX, PPTX, XLSX, images → PDF (LibreOffice, ImageMagick)
- **Subprocess Isolation**: Safe conversion with 2-minute timeouts

### 2. Spatial Text Extraction

**Grid Projection Algorithm** (2249 LOC core):
- Reconstructs spatial layout from raw PDF text items
- Handles multi-column, rotated text, subscripts/superscripts
- Flowing text detection, anchor-based positioning
- Outputs text-to-coordinate mapping for every word

**Bounding Box Tracking**:
- Native PDF coordinates + OCR bounding boxes fused
- Multi-stage filtering: overlap removal, deduplication, confidence thresholds (0.1+)
- Result: structured text with precise `{x, y, width, height}` for every element

**Annotation Support**:
- Strikeout `~~`, underline `__`, highlight `==` markup extraction
- Page annotations preserved in output

### 3. OCR Integration

**Dual-Source Strategy**:
- Native text: Fast, accurate font rendering
- OCR: Fallback for scanned/garbled regions
- Fusion: Confidence-weighted merging with deduplication

**Performance**:
- Batch processing (configurable page batches for PDFs)
- Worker pools (Tesseract.js workers, HTTP connection reuse)
- 60-second timeout for HTTP OCR servers

### 4. CLI & SDK

**Command-Line Interface** (`npm i -g @llamaindex/liteparse`):
- `parse <file>` - Extract text/JSON/coordinates
- `batch-parse <dir>` - Parallel file processing
- `screenshot <file>` - Generate page images
- Options: `--ocr-server-url`, `--target-pages`, `--num-workers`, `--password`

**Python SDK** (`pip install liteparse`):
- Wraps Node CLI via subprocess
- `parse()`, `parse_async()`, `batch_parse()`, `screenshot()`
- Typed responses: `ParseResult`, `TextItem`, `BoundingBox`

### 5. Production Features

**Robustness**:
- Font corruption detection and recovery
- Ligature decomposition (fi → f+i)
- Margin removal and null-character cleanup
- Rotated text handling

**Configuration**:
- `ocrLanguage`, `ocrEnabled`, `ocrServerUrl`
- `numWorkers`, `maxPages`, `targetPages`
- `outputFormat`, `preciseBoundingBox`, `preserveSmallText`, `password`
- Configurable via CLI flags or config file

**Error Handling**:
- Try-catch all external calls (APIs, file I/O, conversion)
- Graceful degradation (OCR failure → native text fallback)
- Meaningful error messages for debugging

## Technical Requirements

### Functional Requirements

**FR1: PDF Text Extraction**
- Extract text from PDF files with positioning info
- Support multiple PDF engines (pluggable)
- Handle font corruption and garbled regions
- Output structured data (text, coordinates, confidence)

**FR2: OCR Integration**
- Support Tesseract.js and HTTP-based OCR servers
- Fuse native text with OCR results
- Deduplication and confidence-weighted merging
- Language-specific recognition (100+ languages)

**FR3: Multi-Format Conversion**
- Convert DOCX, PPTX, XLSX, images to PDF
- Subprocess isolation for safety
- Support custom conversion backends
- Timeout and error handling

**FR4: Spatial Extraction**
- Map text to precise bounding boxes
- Handle rotated text and multi-column layouts
- Support subscript/superscript conversion
- Preserve annotation metadata

**FR5: Batch Processing**
- Process multiple files in parallel
- Worker pool management
- Configurable page batching for large PDFs
- Progress reporting and cancellation

**FR6: Configuration & Extensibility**
- Support config files and CLI flags
- Pluggable engines and parsers
- Environment variable support
- Password-protected PDF handling

### Non-Functional Requirements

**NFR1: Performance**
- Parse 10-page PDF in < 5 seconds (native)
- Handle 1000+ page PDFs with batching
- Worker pool scales to CPU count
- Efficient memory usage for large documents

**NFR2: Reliability**
- Graceful fallback on OCR failure
- Robust error handling for corrupted PDFs
- Cross-platform compatibility (Windows, macOS, Linux)
- Comprehensive logging for debugging

**NFR3: Accuracy**
- Native text extraction preserves font info
- OCR fallback for scanned regions (> 0.1 confidence)
- Coordinate accuracy within PDF units
- Minimal false positives in text fusion

**NFR4: Usability**
- Simple API: `parse(file) → ParseResult`
- Clear error messages with remediation hints
- Sensible defaults, minimal configuration
- Consistent CLI and Python SDK interfaces

**NFR5: Maintainability**
- TypeScript strict mode, ESM modules
- < 200 LOC per file (core files respect this)
- Comprehensive test coverage (30s timeout, v8 coverage)
- Well-documented architecture and data flows

**NFR6: Security**
- No dependency on closed-source OCR APIs
- Subprocess isolation for format conversions
- Input validation and sanitization
- GDPR-friendly (no data transmission except to configured OCR server)

## Success Metrics

### Adoption Metrics
- GitHub stars: 2.8k+ (as of v1.5.2)
- NPM downloads: 10k+ monthly
- Active users: Growing RAG/document processing community
- Ecosystem integration: Langchain, Llamaindex, custom implementations

### Performance Metrics
- PDF parse latency (10 pages): < 5 seconds
- OCR fallback overhead: < 2 seconds per page
- Memory usage (100+ pages): < 500MB with batching
- Batch processing throughput: > 100 files/hour

### Quality Metrics
- Test coverage: > 80% (vitest, v8)
- Font corruption detection accuracy: > 95%
- OCR deduplication precision: > 90%
- Regression test pass rate: 100%

### Reliability Metrics
- Uptime for CLI: 99.9% (no external deps for core parse)
- Error recovery rate: 95% (graceful fallbacks)
- Documentation freshness: < 1 week (release-synced)
- Issue response time: < 48 hours (community)

## Technical Architecture

### Core Components

**1. PDF Engine Layer** (`src/engines/pdf/`)
- `interface.ts`: Engine contract (loadDocument, extractPage, renderImage, close)
- `pdfjs.ts` (937 LOC): PDF.js v5 with font corruption handling
- `pdfium-renderer.ts`: WASM-based rendering for screenshots
- `pdfjsImporter.ts`: DOM polyfills for Node.js

**2. OCR Engine Layer** (`src/engines/ocr/`)
- `interface.ts`: Engine contract (recognize, recognizeBatch)
- `tesseract.ts` (212 LOC): Tesseract.js with worker pools
- `http-simple.ts`: HTTP client to external OCR servers

**3. Processing Pipeline** (`src/processing/`)
- `gridProjection.ts` (2249 LOC): Spatial layout reconstruction
- `bbox.ts`: Native + OCR fusion with deduplication
- `cleanText.ts`: Margin removal, null-char cleanup
- `searchItems.ts`: Phrase search with bbox merging

**4. Output & Conversion** (`src/output/`, `src/conversion/`)
- `json.ts`: Structured JSON output with pages/items/metadata
- `text.ts`: Plain text with page separators
- `convertToPdf.ts`: Multi-format → PDF (LibreOffice, ImageMagick)

**5. Core Parser** (`src/core/parser.ts`, 495 LOC)
- Bootstraps engines, manages config
- `parse()` → `ParseResult` (text, json, pages)
- `screenshot()` → page images

### Technology Stack

**Runtime**:
- TypeScript ES2022, strict mode, ESM
- Node.js >= 14 (CLI), >= 18 (recommended)
- Python 3.8+ (SDK wrapper)

**Core Dependencies**:
- @hyzyla/pdfium (WASM renderer)
- tesseract.js v7 (OCR)
- pdf-parse, pdfjs-dist (PDF.js)
- axios (HTTP)
- sharp (image processing)
- commander (CLI)
- zod (validation)
- p-limit (worker pools)

**Development**:
- Vitest (30s timeout, v8 coverage)
- TypeScript compiler
- ESLint, Prettier (optional)

### Integration Points

**External Services**:
- Tesseract.js (npm package, browser/Node)
- EasyOCR/PaddleOCR servers (HTTP API)
- LibreOffice (subprocess, DOCX/PPTX/XLSX)
- ImageMagick (subprocess, images)

**CLI Entry**:
- `src/index.ts` → `cli/parse.ts` (Commander.js)
- Install: `npm i -g @llamaindex/liteparse` or `brew install`

**Python SDK**:
- `packages/python/liteparse/` → Node CLI subprocess calls
- v1.2.1, wraps entire library

## Use Cases

### UC1: Extract Text from PDF (Default)
**Actor**: ML Engineer building RAG
**Goal**: Get structured text + coordinates from PDF
**Flow**:
1. Install: `npm i @llamaindex/liteparse` or `pip install liteparse`
2. Call `parse(file)` with PDF path
3. Library auto-detects native text quality
4. Returns `ParseResult` with text, json (structured), pages (metadata)
5. Iterate with OCR enabled for scanned regions

**Outcome**: Text + bounding boxes ready for vector embeddings

### UC2: Multi-Format Document Processing
**Actor**: Data integration team
**Goal**: Ingest DOCX, PPTX, XLSX, images alongside PDFs
**Flow**:
1. Configure: `convertToPdf: true` in config
2. Call `parse(file)` with any supported format
3. LibreOffice converts DOCX→PDF, PPTX→PDF, XLSX→PDF
4. ImageMagick converts PNG/JPG→PDF
5. Library parses resulting PDF
6. Returns unified output

**Outcome**: Consistent parsing API across file types

### UC3: Batch Processing Large Directory
**Actor**: Document processing vendor
**Goal**: Extract text from 1000+ PDFs in parallel
**Flow**:
1. Use CLI: `batch-parse /path/to/pdfs --num-workers 8 --max-pages 100`
2. Library spins up 8 worker threads
3. Each worker processes one file, respects 100-page limit
4. Progress logged to stdout
5. Results written as JSON files

**Outcome**: 1000+ files processed in hours (not days)

### UC4: Scanned PDF with Poor OCR
**Actor**: Healthcare provider
**Goal**: Extract text from historical scanned documents
**Flow**:
1. Enable OCR: `parse(file, {ocrEnabled: true, ocrLanguage: 'en'})`
2. Library finds native text is sparse/garbled
3. Falls back to Tesseract.js for full OCR
4. Fuses OCR results with native (confidence-weighted)
5. Returns high-confidence merged text

**Outcome**: Scanned documents become searchable/indexable

### UC5: Custom OCR Server Integration
**Actor**: Enterprise with private OCR infrastructure
**Goal**: Use internal EasyOCR server instead of Tesseract
**Flow**:
1. Deploy EasyOCR server internally
2. Configure: `parse(file, {ocrServerUrl: 'http://internal-ocr:8828'})`
3. Library sends pages via HTTP multipart/form-data
4. Server returns results in standard format
5. Library fuses with native text

**Outcome**: On-premise, GDPR-compliant document processing

## Constraints & Limitations

### Technical Constraints
- Requires Node.js >= 14 (recommend 18+)
- Large PDFs (> 500 pages) need batching to avoid memory exhaustion
- Some fonts may still fail despite corruption handling
- OCR requires 60-second timeout tolerance for HTTP servers

### Operational Constraints
- LibreOffice/ImageMagick needed for format conversion (subprocess overhead ~2-5 sec)
- Tesseract.js adds ~100MB to bundle (optional, lazy-loaded)
- OCR servers must be externally managed (not bundled)

### Design Constraints
- PDF.js v5 only (no v4 backward compatibility)
- Bounding box coordinates in PDF units (not pixels)
- Single-threaded per document (parallelism via workers, not threads)
- No incremental parsing (full-file approach)

## Risks & Mitigation

### Risk 1: Font Corruption Not Fully Recoverable
**Impact**: Medium
**Likelihood**: Low
**Mitigation**: Adobe Glyph Map + Windows-1252 fallback; OCR fallback for remainder

### Risk 2: Large PDF Memory Exhaustion
**Impact**: High
**Likelihood**: Medium
**Mitigation**: Configurable page batching (default 5); --max-pages limit in CLI

### Risk 3: OCR Server Downtime
**Impact**: Medium
**Likelihood**: Medium
**Mitigation**: Graceful degradation to native text; retry with backoff; health checks

### Risk 4: Dependency Vulnerabilities
**Impact**: High
**Likelihood**: Low
**Mitigation**: Regular audits, minimal deps, pinned versions, npm ci

### Risk 5: Breaking Changes in PDF.js or Tesseract.js
**Impact**: Medium
**Likelihood**: Low
**Mitigation**: Version pinning, compatibility layer, community patch contributions

## Future Roadmap

### Phase 1: Foundation (Complete - v1.0-1.4)
- ✅ PDF.js engine + text extraction
- ✅ Tesseract.js OCR integration
- ✅ Bounding box tracking
- ✅ CLI interface
- ✅ Python SDK wrapper

### Phase 2: Enhancement (Current - v1.5+)
- 🔄 PDFium WASM renderer for screenshots
- 🔄 Multi-format conversion (DOCX, XLSX, PPTX, images)
- 🔄 HTTP-based OCR server support
- 🔄 Batch processing & worker pools
- 🔄 Improved font corruption recovery

### Phase 3: Advanced Features (Planned)
- 📋 Semantic chunking for large documents
- 📋 Fine-tuned OCR for domain-specific text
- 📋 Incremental parsing (chunk-level updates)
- 📋 Multi-modal support (image embeddings in PDFs)
- 📋 Real-time streaming parser

### Phase 4: Enterprise (Future)
- 📋 On-premise OCR server container
- 📋 Custom parsing engines (Rust/C++)
- 📋 Compliance & audit logging
- 📋 Self-hosted SaaS option
- 📋 Enterprise support & SLAs

## Dependencies & Integration

### Required
- Node.js >= 14
- Zod (validation)
- pdf-parse

### Optional
- LibreOffice (format conversion)
- ImageMagick (image processing)
- Tesseract.js (OCR, lazy-loaded)
- EasyOCR/PaddleOCR servers (HTTP)

### Integrations
- LlamaIndex (document loader)
- Langchain (document store)
- Custom RAG pipelines

## Compliance & Standards

### Coding Standards
- TypeScript strict mode
- ESM modules only
- < 200 LOC per file (modular design)
- Try-catch all external I/O
- Comprehensive error messages

### Testing Standards
- Vitest with v8 coverage
- 30-second timeout per test
- > 80% code coverage target
- Error scenario testing
- Cross-platform validation

### Documentation Standards
- Markdown in `./docs/`
- Code examples with output
- Architecture diagrams
- API reference auto-generated
- Version-specific docs

## Glossary

- **Grid Projection**: Algorithm reconstructing spatial layout from PDF text items
- **Bounding Box**: {x, y, width, height} defining element position in PDF units
- **OCR Engine**: Plugin for text recognition from images (Tesseract, EasyOCR, etc.)
- **PDF Engine**: Plugin for PDF extraction (PDF.js, PDFium, etc.)
- **Font Corruption**: Text unreadable due to missing/invalid font data
- **Ligature**: Multiple characters rendered as single glyph (fi, ffi, etc.)
- **Worker Pool**: Thread pool for parallel processing with p-limit
- **Batch Processing**: Processing multiple pages/files without sequential I/O

## Appendix

### Related Documentation
- [Codebase Summary](./codebase-summary.md)
- [Code Standards](./code-standards.md)
- [System Architecture](./system-architecture.md)

### External Resources
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [Tesseract.js](https://github.com/naptha/tesseract.js)
- [Qdrant Vector DB](https://qdrant.tech/) (common integration)

### Community
- GitHub Issues: https://github.com/run-llama/liteparse/issues
- Discussions: https://github.com/run-llama/liteparse/discussions
- Repository: https://github.com/run-llama/liteparse

## Unresolved Questions

1. **Semantic Chunking**: Should Phase 3 use embeddings or heuristics for section detection?
2. **Fine-tuning**: Is domain-specific OCR model fine-tuning cost-effective vs. post-processing?
3. **Streaming**: Can streaming parser handle bounding box calculations in real-time?
4. **Multi-modal**: How to handle embedded images in PDFs without separate image pipelines?
