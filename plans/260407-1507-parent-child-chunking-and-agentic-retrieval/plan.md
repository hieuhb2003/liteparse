# Parent-Child Chunking + Agentic Retrieval

**Created**: 2026-04-07
**Status**: Completed
**Priority**: High
**Mode**: Hard
**blockedBy**: []
**blocks**: []

## Problem

1. **Ingestion:** Batched PDF parsing embeds per-batch → chunks cut across section boundaries (e.g. section 5.2. spanning page 5-6 gets split into separate batches)
2. **Chunking:** Flat 512-char chunks lose table context — tables get cut mid-row with no way to recover full context
3. **Retrieval:** Direct chunk search returns fragments. LLM receives truncated sections, produces incomplete/wrong answers

## Solution: Parent-Child Chunking + Agentic Retrieval

### Ingestion
- Batch parse (memory-safe) → **collect text only** → concat full document → split by structure

### Chunking (2-tier)
- **Parent chunks**: Split by heading markers (`# `, `## `, `### `), merge small sections, cap large ones. Stored in Redis. NOT embedded.
- **Child chunks**: Split parents by RecursiveCharacterTextSplitter (512 chars). Embedded + stored in Qdrant with `parent_id` reference.

### Retrieval
- Search children → deduplicate parent_ids → fetch parents from Redis → LLM receives full section context

## Architecture

```
PDF → LiteParse (batched) → collect page texts
                                    ↓
                        Concat into full document text
                        (heading markers already injected by parser)
                                    ↓
                    ┌─── Parent Split (by heading) ───┐
                    │                                   │
                    │   # 5.1. Intro (400 chars)        │
                    │   # 5.2. Method (1200 chars)      │  → Redis
                    │   # 5.3. Results (300 chars)      │    key: parent:{doc_id}:{index}
                    │                                   │
                    └───────────────────────────────────┘
                                    ↓
                    ┌─── Child Split (by size) ─────────┐
                    │                                    │
                    │  child_0 (512ch) → parent_id: p0   │
                    │  child_1 (512ch) → parent_id: p1   │  → Qdrant
                    │  child_2 (400ch) → parent_id: p1   │    (embedded)
                    │  ...                               │
                    │                                    │
                    └────────────────────────────────────┘
                                    ↓
                    ┌─── Retrieval ─────────────────────┐
                    │                                    │
                    │  Query → embed → search children   │
                    │  → dedupe parent_ids               │
                    │  → fetch parents from Redis        │
                    │  → LLM receives full sections      │
                    │                                    │
                    └────────────────────────────────────┘
```

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Restructure ingestion: batch-collect → concat → split | `DONE` | Medium | [phase-01](phase-01-restructure-ingestion-pipeline.md) |
| 2 | Parent-child chunker | `DONE` | Medium | [phase-02](phase-02-parent-child-chunker.md) |
| 3 | Parent chunk Redis store | `DONE` | Small | [phase-03](phase-03-parent-chunk-store.md) |
| 4 | Update retrieval to use parent context | `DONE` | Medium | [phase-04](phase-04-update-retrieval-for-parent-context.md) |

## Key Decisions

- **Parent storage: Redis** (DB 3) — already have Redis infra, simple key-value, fast read. Separate DB from metadata (DB 2).
- **Child embedding only** — parents are for context, not search. Saves embedding cost.
- **Batch parse stays** — only for memory management. Text collection happens per-batch, but chunking happens on full doc.
- **Heading-aware parser preserved** — `liteparse_structure_detector.py` already injects `#`/`##`/`###` markers. Parent split leverages these.
- **No LangChain dependency** — implement parent-child split natively. Simpler, no new deps.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/pipeline/chunker.py` | **Rewrite** | Two-tier: parent_split() + child_split() |
| `src/pipeline/ingestion.py` | **Modify** | Batch collect → concat → parent-child split |
| `src/storage/parent_chunk_store.py` | **New** | Redis store for parent chunks (DB 3) |
| `src/pipeline/retrieval.py` | **Modify** | Search child → fetch parent → build context |
| `src/models/document.py` | **Modify** | Add `parent_id` field to DocumentChunk |
| `src/config.py` | **Modify** | Add `redis_parent_store_url` (DB 3) |
| `src/api/dependencies.py` | **Modify** | Add `get_parent_store()` factory |
| `src/tasks/document_tasks.py` | **Modify** | Pass parent store to ingestion pipeline |

## Relationship to Existing Plans

- **260407-1107-header-aware-chunking**: Phase 1 (structure detection) already completed and merged. Phase 2 (heading-aware chunking) is superseded by this plan's parent-child approach.
