# Code Standards & Development Practices

**Last Updated**: 2026-04-23
**Version**: 1.5.2
**Applies To**: LiteParse (TypeScript/Node.js/Python)

## Overview

This document defines coding standards, patterns, and best practices for the LiteParse project. All code must adhere to these standards to ensure consistency, maintainability, and quality.

## Core Principles

**YAGNI** (You Aren't Gonna Need It): Implement only what's needed now

**KISS** (Keep It Simple, Stupid): Prefer straightforward solutions over complexity

**DRY** (Don't Repeat Yourself): Eliminate code duplication via shared utilities

## File Organization

### Directory Structure

```
liteparse/
├── src/
│   ├── engines/                # Pluggable engine interfaces
│   ├── processing/             # Text extraction & layout algorithms
│   ├── output/                 # Output format implementations
│   ├── conversion/             # Format conversion (DOCX, XLSX, etc.)
│   ├── core/                   # Parser class & types
│   ├── index.ts                # CLI bootstrap
│   └── lib.ts                  # Public API exports
├── cli/                        # CLI command implementations
├── packages/python/            # Python SDK wrapper
├── ocr/                        # OCR server implementations
├── tests/                      # Test suite (Vitest)
├── docs/                       # Documentation
└── package.json               # Dependencies & metadata
```

### File Naming

**TypeScript Files** (kebab-case, descriptive):
- `grid-projection.ts`, `bbox-fusion.ts`, `ocr-engine.ts`
- Test files: `filename.test.ts` or `filename.spec.ts`

**Python Files** (snake_case):
- `grid_projection.py`, `ocr_engine.py`

**Directories** (kebab-case):
- `src/engines/`, `src/processing/`, `src/conversion/`

## File Size Management

**Hard Limit**: 200 LOC per source file (modular design)
- Exceptions: Generated files, config files (marked clearly)
- Refactor strategy: Extract utilities, split components, create service classes

## Naming Conventions

### JavaScript/TypeScript

**Variables** (camelCase):
```typescript
const textItems: TextItem[] = [];
const isValidBbox = bbox.width > 0;
```

**Functions** (camelCase):
```typescript
function extractPageText(page: Page): string {}
const projectGridLayout = (items: TextItem[]): Grid => {};
```

**Classes** (PascalCase):
```typescript
class PdfJsEngine implements PdfEngine {}
class OcrResult { text: string; bbox: BBox; }
```

**Constants** (UPPER_SNAKE_CASE):
```typescript
const MAX_PAGES = 10000;
const DEFAULT_DPI = 150;
const ADOBE_GLYPH_MAP = {...};
```

**Private Members** (leading underscore):
```typescript
class Engine {
  private _connectionPool: Pool;
  private _normalizeLanguage(lang: string): string {}
}
```

### API Design

**REST Endpoints** (kebab-case URLs):
```
GET    /api/documents
POST   /api/ocr/recognize
DELETE /api/documents/:id
```

**JSON Fields** (camelCase):
```json
{
  "textItems": [],
  "boundingBoxes": [],
  "totalPages": 10
}
```

## Code Style Guidelines

### Formatting

**Indentation**: 2 spaces (no tabs)

**Line Length**: 100 characters preferred, 120 hard limit

**Whitespace**:
- One blank line between functions
- Two blank lines between classes
- Space after keywords: `if (`, `for (`, `while (`
- No space before function parentheses: `functionName(`

### Comments & Documentation

**File Headers** (recommended):
```typescript
/**
 * Grid Projection Algorithm
 *
 * Reconstructs spatial layout from raw PDF text items.
 * Handles multi-column, rotated text, subscripts/superscripts.
 *
 * @module processing/grid-projection
 * @version 1.0.0
 */
```

**Function Documentation**:
```typescript
/**
 * Projects text items onto a grid layout
 *
 * @param items - Raw text items from PDF
 * @param pageWidth - Page width in PDF units
 * @returns Grid with positioned items
 * @throws LayoutError if projection fails
 */
function projectToGrid(items: TextItem[], pageWidth: number): Grid
```

**Inline Comments** (explain WHY, not WHAT):
```typescript
// Adobe Glyph Map: fallback for corrupted font references
const charCode = ADOBE_GLYPH_MAP[fontRef] || charCode;

// Deduplication threshold: same text + overlapping bbox
if (isOverlapping(nativeItem, ocrItem, 0.8)) {
  items.push(mergeByConfidence(nativeItem, ocrItem));
}
```

## Error Handling

**Always Use Try-Catch**:
```typescript
async function parseFile(path: string): Promise<ParseResult> {
  try {
    const buffer = await readFile(path);
    return await parser.parse(buffer);
  } catch (error) {
    logger.error('Parse failed', { path, error: error.message });
    throw new ParseError(`Failed to parse ${path}`, { cause: error });
  }
}
```

**Custom Error Classes**:
```typescript
class ParseError extends Error {
  constructor(message: string, readonly cause?: Error) {
    super(message);
    this.name = 'ParseError';
  }
}

class OcrError extends Error {
  constructor(message: string, readonly engine: string) {
    super(`OCR (${engine}): ${message}`);
    this.name = 'OcrError';
  }
}
```

**Error Logging** (no sensitive data):
```typescript
logger.error('Request failed', {
  url: sanitize(url),
  statusCode: response.status,
  error: error.message
});
```

## Security Standards

### Input Validation

```typescript
function parse(config: LiteParseConfig) {
  // Validate config structure
  if (!config.input || typeof config.input !== 'string') {
    throw new ValidationError('input required');
  }

  // Validate numeric bounds
  if (config.dpi < 50 || config.dpi > 600) {
    throw new ValidationError('dpi must be 50-600');
  }

  // Sanitize file paths
  const safePath = resolvePath(config.input);
}
```

### Sensitive Data Handling

```typescript
// BAD: Never log passwords or API keys
logger.info('Auth', { password: config.password });

// GOOD: Use environment variables
const ocrUrl = process.env.OCR_SERVER_URL;
const apiKey = process.env.OPENAI_API_KEY; // Never in code
```

**No Hardcoded Secrets**:
- API keys → environment variables
- Credentials → .env files (gitignored)
- Tokens → secure storage in production

## Testing Standards

### Test File Organization

```
tests/
├── unit/
│   ├── processing/
│   └── engines/
├── integration/
│   ├── parser.test.ts
│   └── conversion.test.ts
└── fixtures/          # Test data
    ├── sample.pdf
    └── test-config.json
```

### Test Naming

```typescript
describe('GridProjection', () => {
  describe('projectToGrid', () => {
    it('should position text items in correct grid cells', async () => {
      // Arrange
      const items = [...];
      
      // Act
      const grid = projectToGrid(items, 600);
      
      // Assert
      expect(grid.cells).toHaveLength(5);
      expect(grid.cells[0].text).toBe('Header');
    });

    it('should handle rotated text', async () => {
      // Test implementation
    });
  });
});
```

### Coverage Requirements

- **Unit Tests**: > 80% code coverage
- **Integration Tests**: Critical user flows
- **Error Scenarios**: All error paths tested
- **Cross-Platform**: Windows, macOS, Linux validation

## Git Standards

### Commit Messages (Conventional Commits)

**Format**:
```
type(scope): description

[optional body explaining why]

[optional footer with issue references]
```

**Types**:
- `feat`: New feature (minor version bump)
- `fix`: Bug fix (patch bump)
- `docs`: Documentation updates
- `refactor`: Code reorganization
- `test`: Test additions
- `perf`: Performance improvements
- `chore`: Maintenance tasks

**Examples**:
```
feat(ocr): add HTTP OCR server support

Implements OcrEngine for external HTTP servers.
Supports EasyOCR and PaddleOCR formats.

Closes #42

---

fix(bbox): handle overlapping text deduplication

Fixed confidence-weighted merging for overlapping
native and OCR results.

---

docs: update API reference with new config options
```

**Rules**:
- Lowercase, no period on subject
- Max 72 characters for subject
- Blank line before body
- Explain WHY, not WHAT
- No AI attribution or signatures

### Branch Naming

**Format**: `type/description`

**Types**: `feature/`, `fix/`, `refactor/`, `docs/`, `test/`

**Examples**:
```
feature/http-ocr-server
fix/bbox-deduplication
docs/architecture-update
```

### Pre-Commit Checklist

- ✅ No secrets or credentials
- ✅ No debug code or console.logs
- ✅ Tests pass locally
- ✅ Code follows style guidelines
- ✅ No linting errors
- ✅ Files under 200 LOC
- ✅ Conventional commit message

## Documentation Standards

### Code Documentation

**Self-Documenting Code**:
- Clear variable/function names
- Logical organization
- Minimal inline comments needed

**When to Comment**:
- Complex algorithms (grid projection, font corruption handling)
- Non-obvious optimizations
- Workarounds for bugs/limitations
- Public API functions
- Configuration options

### Markdown Documentation

**Structure**:
```markdown
# Document Title

Brief overview (1-2 sentences)

## Section 1

Content with examples

## Section 2

More content

## See Also

- [Related Doc](./related.md)
```

**Code Blocks**:
```typescript
function example() {
  return 'example';
}
```

## Quality Assurance

### Code Review Checklist

**Functionality**:
- ✅ Implements required features
- ✅ Handles edge cases
- ✅ Error handling complete
- ✅ Input validation present

**Code Quality**:
- ✅ Follows naming conventions
- ✅ Respects file size limits
- ✅ DRY principle applied
- ✅ Well-structured

**Security**:
- ✅ No hardcoded secrets
- ✅ Input validation present
- ✅ Error messages safe
- ✅ Dependencies secure

**Testing**:
- ✅ Unit tests included
- ✅ Error paths covered
- ✅ Integration tests for flows

**Documentation**:
- ✅ API docs updated
- ✅ README updated if needed
- ✅ Code comments where needed

## Performance Standards

### Optimization Priorities

1. Correctness first
2. Readability second
3. Performance third (when needed)

### Common Optimizations

**Batch Operations** (reduce I/O):
```typescript
// Batch embeddings: 100 texts per API call
const batched = items.chunk(100);
for (const batch of batched) {
  await embedding.embedBatch(batch);
}
```

**Worker Pools** (parallelism):
```typescript
const limit = pLimit(numWorkers);
const tasks = files.map(f => limit(() => parse(f)));
await Promise.all(tasks);
```

**Lazy Loading**:
```typescript
let tesseract: Tesseract | null = null;
if (ocrEnabled && !tesseract) {
  tesseract = await Tesseract.create(); // Lazy init
}
```

## Configuration Management

### Environment Variables

```env
OCR_SERVER_URL=http://localhost:8828
OCR_LANGUAGE=en
NUM_WORKERS=4
LITEPARSE_TMPDIR=/tmp/liteparse
```

### Config Files

**Via Command Line**:
```bash
liteparse parse file.pdf --config config.json
```

**Via Environment**:
```bash
export OCR_SERVER_URL=http://internal-ocr:8828
liteparse parse file.pdf
```

## Enforcement

### Automated Checks

**Pre-Commit**:
- Commitlint (conventional commits)
- Type checking (tsc)

**CI/CD** (GitHub Actions):
- Full test suite
- Coverage reports
- Type checking
- Build verification

## References

### Internal Documentation
- [Project Overview PDR](./project-overview-pdr.md)
- [Codebase Summary](./codebase-summary.md)
- [System Architecture](./system-architecture.md)

### External Standards
- [Conventional Commits](https://conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
