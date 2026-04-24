# Phase 01: Filter Header/Footer + Detect Section Headings

**Priority**: High
**Status**: TODO

## Overview

Enhance `LiteParseParser._parse_json_output()` to:
1. Filter out header/footer noise (repeated text across pages like document title, page numbers)
2. Detect section headings via numbered patterns and inject `#`/`##` markers

## Key Insights

- Header/footer text repeats at similar y-positions across pages (e.g. "Rough design" at y≈34, page numbers at y≈26)
- Section headings follow numbered patterns: `5.2.`, `7.3.1.`, `12.1.`
- y-position from textItems helps filter page-level noise
- fontName CAN distinguish bold/heading fonts (e.g. `g_d0_f2` vs `g_d0_f1` in output_24.json) — but deferred to future improvement. Current scope: section regex only.

## Related Code Files

- **Modify:** `src/parsers/liteparse_parser.py` — enhance `_parse_json_output()`

## Implementation Steps

### 1. Filter header/footer text

Detect text that repeats across pages at the same y-position:

```python
def _detect_repeated_lines(pages_data: list[dict]) -> set[str]:
    """Find text that appears on 50%+ pages at similar y positions — likely header/footer."""
    line_counts = Counter()  # (rounded_y, text) → count
    total_pages = len(pages_data)
    for page in pages_data:
        seen_on_page = set()
        for item in page.get("textItems", []):
            key = (round(item["y"], 0), item["text"].strip())
            if key not in seen_on_page:
                line_counts[key] += 1
                seen_on_page.add(key)
    threshold = max(2, total_pages * 0.5)
    return {text for (_, text), count in line_counts.items() if count >= threshold}
```

### 2. Filter page number text

Small fontSize items at top/bottom of page that are just numbers:

```python
def _is_page_number(item: dict, page_height: float) -> bool:
    text = item["text"].strip()
    y = item["y"]
    # Near top or bottom of page, and text is just a number
    return text.isdigit() and (y < 40 or y > page_height - 40)
```

### 3. Detect section headings via regex

Lines starting with a multi-level numbered section pattern (minimum 2 levels to avoid false positives from table rows like `1.`, `2.`):

```python
import re

# Requires at least 2 number parts: "5.2.", "5.2.1.", "12.1." etc.
# Avoids matching: "1.", "2.", "3." (table row numbers)
SECTION_PATTERN = re.compile(r"^(\d+\.\d+\.(?:\d+\.)*)\s+")

def _heading_level(section_num: str) -> int:
    """Determine heading level from section number depth.
    '5.2.'     → 2 parts → # (level 1)
    '5.2.1.'   → 3 parts → ## (level 2)
    '5.2.1.1.' → 4 parts → ## (capped at 2)
    """
    parts = [p for p in section_num.split(".") if p]  # "5.2.1." → ["5","2","1"]
    depth = len(parts)
    if depth <= 2:
        return 1  # #
    return 2      # ##  (capped)
```

**Why `\d+\.\d+\.` minimum:** Table rows often use `1.`, `2.`, `3.` numbering. Single-level numbers are ambiguous — requiring 2+ parts (e.g. `5.2.`) eliminates false positives from tables while still catching all real section headings in technical docs.

### 4. Rebuild page text with structure

```python
def _build_structured_page_text(text_items, repeated_texts, page_height):
    # Group items into lines by y-position
    # Filter out repeated header/footer text and page numbers
    # For remaining lines, check if line starts with section pattern
    # If yes → prefix with "#" or "##" based on depth
    # Join lines with "\n"
```

### 5. Updated _parse_json_output flow

```
pages_data = data["pages"]
    ↓
repeated_texts = _detect_repeated_lines(pages_data)
    ↓
for each page:
    filter out repeated_texts + page numbers
    group textItems into lines (by y-position ±2px)
    for each line:
        if matches SECTION_PATTERN → inject "# " or "## " prefix
    build clean page_text
    ↓
full_text = "\n\n".join(page_texts)
```

## Edge Cases

- Documents without section numbers → no markers injected, current behavior preserved
- Vietnamese docs with different numbering (e.g. "Điều 5.9.9") → regex handles `\d+\.\d+\.` prefix
- Section numbers embedded mid-sentence (e.g. "refer to 5.1.5.6") → regex anchored to line start `^` prevents false matches
- Single-page documents → no header/footer filtering needed (threshold = 2 pages min)
- **Table rows with `1.`, `2.`, `3.`** → NOT matched by regex (requires 2+ level like `5.2.`)

## Success Criteria

- [ ] Repeated header/footer text filtered from parsed output
- [ ] Page numbers removed from parsed text
- [ ] Section headings detected and prefixed with `#`/`##`
- [ ] Documents without section patterns degrade gracefully
- [ ] Parsed text cleaner and more structured than before
