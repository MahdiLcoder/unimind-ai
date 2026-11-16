from __future__ import annotations

from logging import getLogger

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ai.agents.retriever import PermissionScopedRetriever
from ai.rag.service import RAGService
from ai.state.agent import AgentState

logger = getLogger(__name__)


class KnowledgeAgent:
    def __init__(
        self,
        rag_service: RAGService,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        self.rag_service = rag_service
        self.session_factory = session_factory

    async def execute(self, state: AgentState) -> dict[str, object]:
        retry_count = state.get("retry_count", 0)
        retriever = PermissionScopedRetriever(
            rag_service=self.rag_service,
            session_factory=self.session_factory,
            user_id=state["user_id"],
            allowed_course_ids=frozenset(state.get("allowed_course_ids", [])),
            top_k=5 * (2**retry_count),
        )
        retrieval = await retriever.retrieve(state["user_message"])
        documents = [
            {
                "chunk_id": str(chunk.id),
                "document_id": str(chunk.document_id),
                "content": chunk.content,
                "score": chunk.score,
                "source_filename": chunk.source_filename,
            }
            for chunk in retrieval.chunks
        ]
        if not retrieval.chunks:
            return {
                "agent_outputs": {
                    "knowledge": {
                        "content": (
                            "I could not find accessible university documents that "
                            "provide evidence for this question."
                        ),
                        "evidence_sufficient": False,
                        "citation_valid": False,
                        "sources": [],
                    }
                },
                "retrieved_documents": documents,
                "sources": [],
            }

        answer = await self.rag_service.answer_from_retrieval(retrieval)
        source_data = [
            {
                "document_id": str(source.document_id),
                "chunk_id": str(source.chunk_id),
                "source_filename": source.source_filename,
                "page_number": source.page_number,
                "section_title": source.section_title,
                "citation": source.citation,
            }
            for source in answer.sources
        ]
        citation_valid = answer.citation_validation.valid
        return {
            "agent_outputs": {
                "knowledge": {
                    "content": answer.answer,
                    "evidence_sufficient": bool(answer.sources) and citation_valid,
                    "citation_valid": citation_valid,
                    "context_injection_signals": answer.context_injection_signals,
                    "sources": source_data,
                }
            },
            "retrieved_documents": documents,
            "sources": source_data,
        }
