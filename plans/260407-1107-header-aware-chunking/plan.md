# Header-Aware Chunking via Document Structure Detection

**Created**: 2026-04-07
**Status**: Partially Complete (Phase 1 done, Phase 2 superseded)
**Priority**: Medium
**Mode**: Fast

## Problem

Current chunking is blind to document structure — `TextChunker` splits full text by character count, losing section boundaries. Retrieval quality suffers when chunks cut across sections.

## Key Insight from LiteParse Output

```
"Rough design" → fontSize: 10.02, y: 34.92 → header/footer (repeats every page)
"30"           → fontSize: 8, y: 26.3       → page number (repeats every page)
"5.1.6. Choose MCCB's..." → fontSize: 11.52, y: 85.62 → body text with section number
```

- Body text uses **uniform font** (g_d0_f1, 11.52) — no font-based heading distinction
- Actual headings are indicated by **numbered section patterns** (5.2., 5.2.1., 7.3.1.)
- "Rough design" = document title in header/footer, NOT a heading
- LiteParse does NOT produce `#`/`##` markers

## Solution

Two-step approach:
1. **Filter noise** — remove header/footer/page-number text using y-position + repetition detection
2. **Detect sections** — identify numbered section patterns via regex, inject `\n## ` markers before chunking

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Filter header/footer + detect section headings | `DONE` | [phase-01](phase-01-detect-headings-from-font-metadata.md) |
| 2 | Heading-aware chunking | `SUPERSEDED` | Replaced by [parent-child chunking plan](../260407-1507-parent-child-chunking-and-agentic-retrieval/plan.md) |

## Key Decisions

- Section number regex (e.g. `^\d+\.\d+\.`) as primary heading signal — works across diverse technical docs
- y-position + cross-page repetition for header/footer filtering — more robust than font-only
- Heading markers injected as markdown `#`/`##` at parse time, before chunking
- Chunker separators updated: `["\n# ", "\n## ", "\n\n", "\n", ". ", " "]`
- Heading level by depth: `5.2.` (2 parts) → `#`, `5.2.1.` (3 parts) → `##`, deeper → `##` capped

## Future Improvements (not in scope)

- fontName-based heading detection (LiteParse exposes different fontName for bold/title text, e.g. `g_d0_f2` vs `g_d0_f1`). Can combine with section regex for higher confidence. See `output_24.json` as reference.
