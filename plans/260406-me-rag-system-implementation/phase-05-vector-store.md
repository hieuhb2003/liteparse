# Phase 05: Vector Store (Qdrant)

**Priority**: HIGH
**Status**: TODO
**Description**: Abstract vector store interface with Qdrant implementation

## Files to Create

- `src/me_rag/vectorstore/__init__.py`
- `src/me_rag/vectorstore/base.py`
- `src/me_rag/vectorstore/qdrant-store.py`

## Architecture

```python
class BaseVectorStore(ABC):
    @abstractmethod
    async def upsert(self, chunks: list[DocumentChunk]) -> None:
        """Upsert chunks with embeddings"""

    @abstractmethod
    async def search(self, query_embedding: list[float], top_k: int, 
                     filters: dict | None = None) -> list[ScoredChunk]:
        """Search by vector similarity"""

    @abstractmethod
    async def delete_by_document(self, document_id: str) -> int:
        """Delete all chunks for a document, return count"""

    @abstractmethod
    async def get_chunks_by_document(self, document_id: str) -> list[DocumentChunk]:
        """Get all chunks for a document"""

    @abstractmethod
    async def ensure_collection(self) -> None:
        """Create collection if not exists"""
```

### Qdrant Implementation

- Uses `qdrant-client` async client
- Collection auto-created on startup
- Payload stores: document_id, chunk_index, page_number, content, metadata
- Filterable by document_id, metadata fields
- Uses cosine similarity

## Implementation Steps

1. Create `base.py` with ABC
2. Implement `qdrant-store.py` with all methods
3. Add collection initialization to app startup
4. Test upsert, search, delete operations

## Success Criteria

- [ ] Collection created automatically
- [ ] Chunks upserted with vectors and payload
- [ ] Search returns ranked results by similarity
- [ ] Delete removes all chunks for a document
- [ ] Metadata filtering works
