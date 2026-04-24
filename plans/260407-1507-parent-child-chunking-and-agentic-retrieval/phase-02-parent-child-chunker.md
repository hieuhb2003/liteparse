# Phase 02: Parent-Child Chunker

**Priority**: High
**Status**: DONE

## Overview

Replace current flat `TextChunker` with a two-tier chunker:
1. **Parent split**: By heading markers → large, semantically complete sections
2. **Child split**: By character size → small, embeddable chunks with `parent_id`

## Key Insights

- Parser already injects `# `, `## `, `### ` markers via `liteparse_structure_detector.py`
- Parents must be self-contained sections (a heading + its content). Tables within a section stay intact.
- Children are only used for vector search — precision matters, not completeness
- Parent size bounds: merge < 200 chars, split > 2000 chars (configurable)

## Related Code Files

- **Rewrite:** `src/pipeline/chunker.py`
- **Modify:** `src/models/document.py` — add `parent_id` to `DocumentChunk`

## Implementation Steps

### 1. New ChunkConfig

```python
class ChunkConfig(BaseModel):
    # Parent
    parent_min_size: int = 200     # merge sections smaller than this
    parent_max_size: int = 2000    # split sections larger than this
    heading_separators: list[str] = ["\n# ", "\n## ", "\n### "]

    # Child
    child_chunk_size: int = 512
    child_chunk_overlap: int = 50
    child_separators: list[str] = ["\n\n", "\n", ". ", " "]
```

### 2. Parent split logic

```python
def parent_split(self, text: str) -> list[ParentChunk]:
    """Split text by heading markers into parent sections."""
    # 1. Split by highest-level heading first ("\n# ")
    # 2. Re-attach heading prefix to each part
    # 3. Merge small parents (< parent_min_size) into previous
    # 4. Split large parents (> parent_max_size) by next heading level
    #    If no sub-headings, use RecursiveCharacterTextSplitter logic
    # 5. Return list of ParentChunk(id, heading, content, page_numbers)
```

**Merge logic:**
```python
def _merge_small_parents(self, parents: list[ParentChunk]) -> list[ParentChunk]:
    merged = []
    current = None
    for p in parents:
        if current is None:
            current = p
        elif len(current.content) < self._config.parent_min_size:
            current.content += "\n\n" + p.content
            current.heading = f"{current.heading} + {p.heading}"
        else:
            merged.append(current)
            current = p
    if current:
        # If last chunk is too small, merge into previous
        if merged and len(current.content) < self._config.parent_min_size:
            merged[-1].content += "\n\n" + current.content
        else:
            merged.append(current)
    return merged
```

**Split large parents:**
```python
def _split_large_parent(self, parent: ParentChunk) -> list[ParentChunk]:
    if len(parent.content) <= self._config.parent_max_size:
        return [parent]
    # Try sub-heading split first ("\n## " → "\n### ")
    # Fallback: RecursiveCharacterTextSplitter with parent_max_size
```

### 3. Child split logic

```python
def child_split(self, parent: ParentChunk) -> list[ChildChunk]:
    """Split parent into embeddable child chunks."""
    # Standard recursive character split on parent.content
    # Each child gets parent_id reference
    chunks = self._recursive_split(
        parent.content,
        self._config.child_separators,
        self._config.child_chunk_size,
    )
    return [
        ChildChunk(content=text, parent_id=parent.id)
        for text in chunks
    ]
```

### 4. Data models

```python
@dataclass
class ParentChunk:
    id: str             # "{doc_id}_parent_{index}"
    content: str
    heading: str        # e.g. "# 5.2. Method"
    page_numbers: list[int] = field(default_factory=list)

@dataclass
class ChildChunk:
    content: str
    parent_id: str      # reference to ParentChunk.id
```

### 5. Top-level API

```python
class TextChunker:
    def split(self, text: str, document_id: str = "") -> tuple[list[ParentChunk], list[ChildChunk]]:
        parents = self.parent_split(text)
        # Assign IDs
        for i, p in enumerate(parents):
            p.id = f"{document_id}_parent_{i}" if document_id else f"parent_{i}"
        # Split each parent into children
        children = []
        for parent in parents:
            children.extend(self.child_split(parent))
        return parents, children
```

### 6. Update DocumentChunk model

Add `parent_id` field:

```python
class DocumentChunk(BaseModel):
    chunk_id: str
    document_id: str
    content: str
    chunk_index: int
    page_number: int | None = None
    token_count: int = 0
    embedding: list[float] | None = None
    metadata: dict = {}
    parent_id: str | None = None  # NEW — reference to parent chunk
```

## Edge Cases

- Document without headings → entire text = 1 parent. If > `parent_max_size`, split by `"\n\n"` then `"\n"`.
- Very short document (< `parent_min_size`) → 1 parent, 1 child. No splitting needed.
- Heading at very end of document (empty section) → filtered out during merge.
- Table spanning 800 chars within a 1200-char section → stays in 1 parent. Child might cut table, but parent preserves it.

## Success Criteria

- [x] `parent_split()` splits by heading markers correctly
- [x] Small parents merged, large parents split
- [x] `child_split()` produces 512-char chunks with parent_id
- [x] Documents without headings degrade gracefully (1 parent, recursive child split)
- [x] `DocumentChunk` model has `parent_id` field
- [x] Existing `_recursive_split` logic reused for child splitting

## Completion Notes

Two-tier chunking implemented with fixes from code review:
- `_try_sub_heading_split()` now skips same/higher heading level to prevent infinite recursion
- `_split_by_char_size()` guards against overlap >= size infinite loop
- Parent/child split tested across document variations (no headings, large sections, table preservation)
