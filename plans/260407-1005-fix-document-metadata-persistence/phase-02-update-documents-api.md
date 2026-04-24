# Phase 02: Update Documents API

**Priority**: High
**Status**: TODO

## Overview

Replace all `_documents` dict usage in `src/api/documents.py` with `DocumentMetadataStore`.

## Related Code Files

- **Modify:** `src/api/documents.py` — replace `_documents` dict with store calls

## Implementation Steps

1. Remove `_documents: dict[str, dict] = {}` global variable

2. Add store dependency to each endpoint:
   ```python
   from api.dependencies import get_document_store
   store = get_document_store()
   ```

3. **upload_document**: Replace `_documents[doc_id] = doc_record` with `await store.save(doc_id, doc_record)`

4. **list_documents**: Replace dict slicing with `await store.list_all(page, page_size)`

5. **get_document**: Replace `_documents.get(document_id)` with `await store.get(document_id)`

6. **delete_document**: Replace `_documents.get()` + `del _documents[]` with:
   - `await store.get(document_id)` — check exists
   - `await vector_store.delete_by_document(document_id)` — delete chunks
   - `await store.delete(document_id)` — delete metadata
   - If not in store but has chunks in Qdrant → still delete from Qdrant (handles orphaned data)

7. **get_document_status**: Replace `_documents.get()` with `await store.get(document_id)`

## Key Consideration

For `delete_document`, handle the case where metadata is missing but chunks exist in Qdrant (orphaned from previous in-memory era). Try delete from both — don't 404 if only Qdrant has data.

## Success Criteria

- [ ] `_documents` dict completely removed
- [ ] All 5 endpoints use `DocumentMetadataStore`
- [ ] Delete handles orphaned chunks (no metadata, chunks in Qdrant)
- [ ] No behavior change from user perspective (same request/response)
