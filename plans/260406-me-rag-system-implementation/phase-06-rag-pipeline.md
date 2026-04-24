# Phase 06: RAG Pipeline

**Priority**: MEDIUM
**Status**: TODO
**Description**: Text chunking, document ingestion pipeline, and RAG retrieval+generation

## Files to Create

- `src/me_rag/pipeline/__init__.py`
- `src/me_rag/pipeline/chunker.py`
- `src/me_rag/pipeline/ingestion.py`
- `src/me_rag/pipeline/retrieval.py`

## Architecture

### chunker.py - Text Chunking

```python
class ChunkConfig(BaseModel):
    chunk_size: int = 512          # tokens
    chunk_overlap: int = 50
    separator: str = "\n\n"

class TextChunker:
    def chunk(self, text: str, config: ChunkConfig) -> list[str]:
        """Split text into overlapping chunks"""
```

Strategy: recursive character splitting with token counting. Split on paragraphs first, then sentences, then words.

### ingestion.py - Document Ingestion

```python
class IngestionPipeline:
    """Parse → Chunk → Embed → Store"""
    
    async def ingest(self, document_id: str, file_path: str, file_type: FileType) -> Document:
        1. Parse document via parser registry
        2. Chunk text with TextChunker
        3. Embed chunks in batch
        4. Upsert to vector store
        5. Return updated Document with chunks
```

### retrieval.py - RAG Query

```python
class RAGPipeline:
    async def query(self, request: RAGRequest) -> RAGResponse:
        1. Embed query text
        2. Search vector store for top_k chunks
        3. Build context from retrieved chunks
        4. Call LLM with system prompt + context + query
        5. Extract citations from used chunks
        6. Return RAGResponse with answer + citations
```

## Implementation Steps

1. Implement `chunker.py` with recursive splitting
2. Implement `ingestion.py` orchestrating parse→chunk→embed→store
3. Implement `retrieval.py` with RAG query pipeline
4. Wire up dependencies (parser registry, embedding, vector store, LLM)

## Success Criteria

- [ ] Chunker produces overlapping chunks of correct size
- [ ] Ingestion pipeline processes a document end-to-end
- [ ] RAG query returns relevant answer with citations
