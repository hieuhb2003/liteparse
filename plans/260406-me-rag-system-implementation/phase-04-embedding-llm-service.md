# Phase 04: Embedding & LLM Service

**Priority**: HIGH
**Status**: TODO
**Description**: Abstract embedding and LLM interfaces with OpenAI implementation

## Overview

Create abstract base classes for embedding and LLM, with OpenAI-compatible implementations. Designed so a separate self-hosted service can be swapped in later.

## Files to Create

- `src/me_rag/embedding/__init__.py`
- `src/me_rag/embedding/base.py`
- `src/me_rag/embedding/openai-embedding.py`
- `src/me_rag/llm/__init__.py`
- `src/me_rag/llm/base.py`
- `src/me_rag/llm/openai-llm.py`

## Architecture

### Embedding

```python
class BaseEmbedding(ABC):
    @abstractmethod
    async def embed_text(self, text: str) -> list[float]:
        ...

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        ...

    @property
    @abstractmethod
    def dimension(self) -> int:
        ...
```

### LLM

```python
class LLMMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

class LLMResponse(BaseModel):
    content: str
    model: str
    usage: dict[str, int]

class BaseLLM(ABC):
    @abstractmethod
    async def generate(self, messages: list[LLMMessage], **kwargs) -> LLMResponse:
        ...

    @abstractmethod
    async def stream(self, messages: list[LLMMessage], **kwargs) -> AsyncIterator[str]:
        ...
```

### OpenAI Implementation

- Uses `openai` Python SDK
- Configurable `api_base` for self-hosted endpoints (vLLM, Ollama, etc.)
- Handles rate limiting, retries
- Batch embedding with chunked requests

## Config

```python
# In config.py
openai_api_key: str
openai_api_base: str = "https://api.openai.com/v1"
openai_embedding_model: str = "text-embedding-3-small"
openai_llm_model: str = "gpt-4o-mini"
embedding_dimension: int = 1536
embedding_batch_size: int = 100
```

## Implementation Steps

1. Create `embedding/base.py` with ABC
2. Implement `embedding/openai-embedding.py`
3. Create `llm/base.py` with ABC
4. Implement `llm/openai-llm.py`
5. Add config variables to `config.py`
6. Test with OpenAI API

## Success Criteria

- [ ] Embed single text returns vector of correct dimension
- [ ] Batch embedding works with chunking
- [ ] LLM generates response from messages
- [ ] Can point to custom api_base for self-hosted models
