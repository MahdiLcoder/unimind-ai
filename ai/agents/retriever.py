from __future__ import annotations

from typing import Any

from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from pydantic import ConfigDict, PrivateAttr
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ai.rag.service import RAGService, RetrievalResult


class PermissionScopedRetriever(BaseRetriever):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    user_id: str
    allowed_course_ids: frozenset[str] = frozenset()
    top_k: int = 5
    _rag_service: RAGService = PrivateAttr()
    _session_factory: async_sessionmaker[AsyncSession] = PrivateAttr()

    def __init__(
        self,
        *,
        rag_service: RAGService,
        session_factory: async_sessionmaker[AsyncSession],
        user_id: str,
        allowed_course_ids: frozenset[str] = frozenset(),
        top_k: int = 5,
    ) -> None:
        super().__init__(
            user_id=user_id,
            allowed_course_ids=allowed_course_ids,
            top_k=top_k,
        )
        if not user_id.strip():
            raise ValueError("user_id cannot be empty")
        if top_k < 1:
            raise ValueError("top_k must be positive")
        self._rag_service = rag_service
        self._session_factory = session_factory

    async def retrieve(
        self,
        query: str,
        *,
        session: AsyncSession | None = None,
        top_k: int | None = None,
    ) -> RetrievalResult:
        if session is not None:
            return await self._rag_service.retrieve(
                session,
                query,
                user_id=self.user_id,
                allowed_course_ids=self.allowed_course_ids,
                top_k=top_k or self.top_k,
            )
        async with self._session_factory() as owned_session:
            return await self._rag_service.retrieve(
                owned_session,
                query,
                user_id=self.user_id,
                allowed_course_ids=self.allowed_course_ids,
                top_k=top_k or self.top_k,
            )

    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Any,
    ) -> list[Document]:
        del run_manager
        result = await self.retrieve(query)
        return [
            Document(
                page_content=chunk.content,
                metadata={
                    "chunk_id": str(chunk.id),
                    "document_id": str(chunk.document_id),
                    "course_id": chunk.course_id,
                    "page_number": chunk.page_number,
                    "section_title": chunk.section_title,
                    "source_filename": chunk.source_filename,
                    "score": chunk.score,
                },
            )
            for chunk in result.chunks
        ]
