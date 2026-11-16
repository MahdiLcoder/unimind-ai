# Hugging Face and RAG pipeline

## Components

```text
PDF / DOCX / PPTX / TXT / Markdown
          │
          ▼
ai.rag.ingestion ──> ai.rag.chunking ──> SentenceTransformerEmbedder
                                             │
                                             ▼
                                   document_chunks.embedding
                                   PostgreSQL + pgvector
                                             │
question ──> embed ──> hybrid vector/keyword search ──> BGE reranker
                                                          │
                                                          ▼
                                   bounded, cited, untrusted context
                                                          │
                                      Ollama or HF text generation
```

The code is a Python library for the future Knowledge Agent; it does not add
unauthenticated HTTP document endpoints. `RAGService` is the high-level
interface. It accepts a SQLAlchemy `AsyncSession`, an `EmbeddingProvider`, and
trusted identity/course scope supplied by its caller.

## Installation and model behavior

The core API dependencies include parsers, Hugging Face Hub metadata inspection,
HTTP client support, and `pgvector`. PyTorch, Transformers, and
Sentence-Transformers are in the optional `inference` dependency group. That
group resolves CPU-only PyTorch; setup does not download model weights.

The defaults are:

- Embeddings: `BAAI/bge-m3`, 1024 dimensions, batch size 8, CPU.
- Reranking: `BAAI/bge-reranker-base`, CPU.
- Generation: configured Ollama model (`qwen2.5:3b` by default).

Model IDs and local execution settings are read from `HF_EMBEDDING_MODEL`,
`HF_EMBEDDING_DIMENSIONS`, `HF_RERANKER_MODEL`, `HF_DEVICE`, `HF_BATCH_SIZE`,
`OLLAMA_BASE_URL`, and `OLLAMA_MODEL`. Hugging Face Hub model metadata is
available through `HuggingFaceModelInspector.inspect(model_id)`. Hugging Face
weights are downloaded lazily on the first inference call. A process-wide
runtime serializes local inference and keeps only one heavyweight model resident
at a time. Changing the embedding model or dimensions requires a deliberate
database/model migration and reindex; retrieval filters out chunks created by
other embedding model IDs.

## Ingestion, chunking, and metadata

`DocumentExtractor.extract(filename, content, declared_mime_type)` enforces a
20 MiB default upload limit, checks extension/MIME/content signatures, validates
UTF-8 for text formats, rejects empty extracted content, and normalizes Unicode
and whitespace. PDF pages and presentation slides have one-based page numbers.
DOCX headings and Markdown headings become sections; DOCX tables are included.
DOCX/TXT/Markdown do not have stable physical page numbers, so those citations
omit page numbers. Scanned PDFs without an OCR text layer are rejected rather
than silently indexed as empty.

`chunk_document` supports fixed-size, overlapping, recursive, and structure-aware
strategies. Every `Chunk` carries its document UUID, course ID, global chunk
index, source filename, section title, and page number where available.

## Persistence and retrieval

Alembic revision `0002_create_rag_documents` creates `documents` and
`document_chunks`, with a 1024-dimensional vector column, HNSW cosine index,
GIN full-text index, unique per-document chunk ordering, and owner/course
indexes. `PostgresRAGRepository` filters every search by the caller's owner ID
or an explicitly authorized course ID, and optionally narrows by course,
document, and embedding model. It merges cosine similarity and PostgreSQL
`simple` full-text rank, removes duplicate text, and returns top-K candidates.
The reranker is optional; a model-load/inference failure is logged and falls
back to the hybrid retrieval order.

`SentenceTransformerEmbedder` batches normalized vectors, checks configured
dimensions, retries inference failures, and has a bounded process-local LRU
cache. The database uses fixed 1024-dimensional vectors; selecting a model with
a different output dimension is rejected at index time rather than mixed into
the same index.

## Context, citations, and prompt-injection handling

`ContextAssembler` deduplicates source text, enforces a character limit, escapes
source text/metadata inside source delimiters, and creates citations from
persisted document IDs and available page numbers. `validate_citations` checks
that answer citation labels correspond to the retrieved context. A limited
pattern detector flags common prompt-injection phrases; more importantly, all
retrieved content is treated as untrusted evidence and separated from the
system prompt. Detection is defense-in-depth, not a guarantee that arbitrary
prompt injection can be recognized.

The repository enforces document-owner access and course membership only when
the caller supplies trusted identity and course IDs. This phase intentionally
does not invent an authentication mechanism. Do not expose `RAGService` through
an HTTP route until the caller derives these values from verified authentication
claims and checks the user's course memberships.

## Evaluation and verification

`RAGEvaluator` computes Recall@K, Precision@K, MRR, relevance of retrieved gold
chunks, citation correctness, and caller-measured end-to-end latency.
Faithfulness and answer relevance are delegated to the explicit
`AnswerQualityJudge` protocol. `LLMAnswerQualityJudge` provides a JSON-scored
adapter over the configured text generator; those values remain `None` when no
judge is configured rather than being represented by an ungrounded lexical
proxy.

Run unit checks:

```bash
cd services/ai-api
uv sync --frozen
uv run pytest
uv run ruff check . ../../ai
uv run alembic upgrade head
```

The tests generate a small text-bearing PDF and office documents in memory.
The PostgreSQL integration test uses `RAG_TEST_DATABASE_URL`; it passed against
the local pgvector database with test vectors and verifies hybrid SQL search
and access filters. The default suite skips that test when the URL is unset.
There is no real university PDF fixture in this repository, and no local Ollama
or Hugging Face model inference was run. End-to-end multilingual BGE-M3
retrieval and generated-answer/page-citation verification with a real
university PDF therefore remains an environment-level check; the test suite
does not claim that external model smoke test passed.
