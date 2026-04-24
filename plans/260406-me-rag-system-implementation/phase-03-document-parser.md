# Phase 03: Document Parser Module

**Priority**: HIGH
**Status**: TODO
**Description**: Implement document parsing with LiteParse (PDF/DOCX) and custom Excel/CSV parser

## Overview

Build the parser module with abstract base class and concrete implementations. LiteParse handles PDF/DOCX/DOC. Custom code handles XLSX/CSV via openpyxl/pandas.

## Files to Create

- `src/me_rag/parsers/__init__.py`
- `src/me_rag/parsers/base.py`
- `src/me_rag/parsers/liteparse-parser.py`
- `src/me_rag/parsers/excel-parser.py`
- `src/me_rag/parsers/registry.py`

## Architecture

```
parsers/
├── base.py           # ABC: parse(file_path | bytes) -> ParseResult
├── liteparse-parser  # LiteParse Python wrapper for PDF/DOCX/DOC
├── excel-parser      # openpyxl for XLSX, pandas for CSV
└── registry          # FileType -> Parser mapping, auto-detect
```

### base.py - Abstract Parser

```python
class ParseResult(BaseModel):
    text: str
    pages: list[PageContent] = []
    metadata: dict[str, Any] = {}

class PageContent(BaseModel):
    page_number: int
    text: str
    metadata: dict[str, Any] = {}

class BaseParser(ABC):
    @abstractmethod
    async def parse(self, source: str | bytes, **kwargs) -> ParseResult:
        """Parse document, return structured text"""
        ...

    @abstractmethod
    def supported_types(self) -> list[FileType]:
        ...
```

### liteparse-parser.py

- Uses `liteparse` Python package (pip install liteparse)
- Calls LiteParse CLI under the hood
- Requires Node.js 18+ in Docker image
- Supports: PDF, DOCX, DOC

### excel-parser.py

- XLSX: `openpyxl` to read sheets, convert rows to text
- CSV: `pandas.read_csv` or stdlib csv
- Each sheet/CSV becomes a "page"
- Strategy: header row + data rows as structured text

### registry.py

```python
class ParserRegistry:
    def get_parser(self, file_type: FileType) -> BaseParser:
        """Return appropriate parser for file type"""
    
    def register(self, parser: BaseParser) -> None:
        """Register a parser for its supported types"""
```

## Implementation Steps

1. Create `base.py` with ABC and ParseResult model
2. Implement `liteparse-parser.py` using liteparse Python wrapper
3. Implement `excel-parser.py` with openpyxl + pandas
4. Create `registry.py` with auto-detection and parser mapping
5. Export from `__init__.py`
6. Test with sample PDF, DOCX, XLSX, CSV files

## Dependencies

- `liteparse` (Python package)
- `openpyxl` (XLSX)
- `pandas` (CSV)
- Node.js 18+ (for LiteParse CLI backend)

## Success Criteria

- [ ] PDF parsing returns text with page info
- [ ] DOCX parsing works via LiteParse
- [ ] XLSX parsing reads all sheets
- [ ] CSV parsing handles various delimiters
- [ ] Registry auto-selects correct parser by file extension
