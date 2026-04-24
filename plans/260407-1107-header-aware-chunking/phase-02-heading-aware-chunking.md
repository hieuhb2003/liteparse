# Phase 02: Heading-Aware Chunking

**Priority**: High
**Status**: TODO

## Overview

Update `TextChunker` to split on `\n# ` and `\n## ` boundaries first (injected by Phase 01), and improve `_find_page_number` using heading anchors.

## Related Code Files

- **Modify:** `src/pipeline/chunker.py` — add heading separators
- **Modify:** `src/pipeline/ingestion.py` — improve page number tracking

## Implementation Steps

### 1. Update ChunkConfig default separators

```python
class ChunkConfig(BaseModel):
    chunk_size: int = 512
    chunk_overlap: int = 50
    separators: list[str] = ["\n# ", "\n## ", "\n\n", "\n", ". ", " "]
```

### 2. Preserve heading prefix after split

`_recursive_split` drops the separator when splitting. For heading separators, re-prepend the marker:

```python
if separator.startswith("\n#"):
    parts = text.split(separator)
    # Re-attach heading marker to each split part (except first)
    for i in range(1, len(parts)):
        if parts[i].strip():
            parts[i] = separator.strip() + " " + parts[i]
```

### 3. Improve page number tracking

With structured text, heading lines act as unique anchors. Update `_find_page_number`:

```python
def _find_page_number(self, chunk_text: str, pages: list) -> int | None:
    # Try heading match first — more unique than arbitrary text
    for line in chunk_text.split("\n"):
        if line.startswith("#"):
            heading = line.lstrip("# ").strip()
            if heading:
                for page in pages:
                    if heading in page.text:
                        return page.page_number
    # Fallback: first 100 chars overlap
    for page in pages:
        if chunk_text[:100] in page.text:
            return page.page_number
    return None
```

## Success Criteria

- [ ] Chunks split on heading boundaries first
- [ ] Heading markers preserved in chunk content (not lost during split)
- [ ] Page number tracking improved via heading anchors
- [ ] Documents without headings chunk the same as before (no regression)
