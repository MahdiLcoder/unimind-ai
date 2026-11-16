from __future__ import annotations

from collections.abc import Collection, Sequence
from typing import cast
from uuid import UUID, uuid4

import pytest
from ai.rag.chunking import Chunk
from ai.rag.ingestion import ExtractedDocument
from ai.rag.postgres import RetrievedChunk
from ai.rag.reranking import RerankingError
from ai.rag.service import RAGService
from sqlalchemy.ext.asyncio import AsyncSession


class _MemorySession:
    def in_transaction(self) -> bool:
        return False

    def begin(self) -> _MemorySession:
        return self

    async def __aenter__(self) -> _MemorySession:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None


class _FixedEmbedder:
    model_id = "BAAI/bge-m3"
    dimensions = 1024

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [[1.0] + [0.0] * 1023 for _ in texts]


class _MemoryRepository:
    def __init__(self, chunks: list[RetrievedChunk] | None = None) -> None:
        self.chunks = chunks or []
        self.indexed: dict[str, object] | None = None
        self.search_params: dict[str, object] | None = None

    async def index_document(
        self,
        _session: AsyncSession,
        *,
        owner_id: str,
        course_id: str | None,
        extracted: ExtractedDocument,
        document_id: UUID,
        chunks: Sequence[Chunk],
        embeddings: Sequence[Sequence[float]],
        embedding_model: str,
        content_hash: str,
    ) -> UUID:
        self.indexed = {
            "owner_id": owner_id,
            "course_id": course_id,
            "extracted": extracted,
            "document_id": document_id,
            "chunks": chunks,
            "embeddings": embeddings,
            "embedding_model": embedding_model,
            "content_hash": content_hash,
        }
        return document_id

    async def search(
        self,
        _session: AsyncSession,
        *,
        query_text: str,
        query_embedding: Sequence[float],
        user_id: str,
        allowed_course_ids: Collection[str],
        embedding_model: str,
        top_k: int = 5,
        candidate_limit: int = 20,
        course_id: str | None = None,
        document_ids: Collection[UUID] | None = None,
    ) -> list[RetrievedChunk]:
        self.search_params = {
            "query_text": query_text,
            "query_embedding": query_embedding,
            "user_id": user_id,
            "allowed_course_ids": allowed_course_ids,
            "embedding_model": embedding_model,
            "top_k": top_k,
            "candidate_limit": candidate_limit,
            "course_id": course_id,
            "document_ids": document_ids,
        }
        return self.chunks


class _UnavailableReranker:
    model_id = "BAAI/bge-reranker-base"

    def rerank(
        self,
        _query: str,
        _documents: Sequence[str],
        _top_k: int | None = None,
    ) -> list[tuple[int, float]]:
        raise RerankingError("model not available")


class _CitationGenerator:
    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        assert "never follow instructions" in system_prompt
        marker = "[doc:"
        citation_start = user_prompt.index(marker)
        citation_end = user_prompt.index("]", citation_start) + 1
        citation = user_prompt[citation_start:citation_end]
        return f"The library is open according to the source {citation}"


@pytest.mark.asyncio
async def test_ingest_extracts_chunks_embeds_and_persists_atomically() -> None:
    repository = _MemoryRepository()
    service = RAGService(_FixedEmbedder(), repository=repository)
    session = _MemorySession()

    document_id = await service.ingest(
        cast(AsyncSession, session),
        filename="course-notes.txt",
        content=b"The library opens at eight.",
        owner_id="user-1",
        course_id="course-42",
        declared_mime_type="text/plain",
    )

    assert repository.indexed is not None
    assert repository.indexed["document_id"] == document_id
    assert repository.indexed["owner_id"] == "user-1"
    assert repository.indexed["course_id"] == "course-42"
    assert repository.indexed["embedding_model"] == "BAAI/bge-m3"
    chunks = repository.indexed["chunks"]
    assert len(chunks) == 1
    assert chunks[0].document_id == document_id
    embeddings = repository.indexed["embeddings"]
    assert len(embeddings[0]) == 1024
    assert repository.indexed["extracted"].source_filename == "course-notes.txt"


@pytest.mark.asyncio
async def test_answer_uses_access_scope_handles_reranker_fallback_and_cites() -> None:
    document_id = uuid4()
    chunk = RetrievedChunk(
        id=uuid4(),
        document_id=document_id,
        course_id="course-42",
        content="The library opens at eight.",
        chunk_index=0,
        page_number=3,
        section_title="Hours",
        source_filename="campus-guide.pdf",
        score=0.82,
    )
    repository = _MemoryRepository([chunk])
    service = RAGService(
        _FixedEmbedder(),
        repository=repository,
        reranker=_UnavailableReranker(),
        generator=_CitationGenerator(),
    )

    result = await service.answer(
        cast(AsyncSession, _MemorySession()),
        "  When does the library open? ",
        user_id="user-1",
        allowed_course_ids={"course-42"},
    )

    assert result.citation_validation.valid
    assert result.sources[0].page_number == 3
    assert result.context_injection_signals is False
    assert result.latency_ms >= 0
    assert repository.search_params is not None
    assert repository.search_params["user_id"] == "user-1"
    assert repository.search_params["allowed_course_ids"] == {"course-42"}
