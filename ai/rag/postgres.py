from __future__ import annotations

import math
from collections.abc import Collection, Sequence
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from ai.rag.chunking import Chunk
from ai.rag.ingestion import ExtractedDocument
from app.models.documents import EMBEDDING_DIMENSIONS, Document, DocumentChunk


@dataclass(frozen=True, slots=True)
class RetrievedChunk:
    id: UUID
    document_id: UUID
    course_id: str | None
    content: str
    chunk_index: int
    page_number: int | None
    section_title: str | None
    source_filename: str
    score: float


class PostgresRAGRepository:
    async def index_document(
        self,
        session: AsyncSession,
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
        if len(chunks) != len(embeddings) or not chunks:
            raise ValueError("Every non-empty chunk must have one embedding")
        if (
            not owner_id.strip()
            or len(owner_id) > 255
            or (course_id is not None and (not course_id.strip() or len(course_id) > 255))
            or not embedding_model.strip()
            or len(embedding_model) > 255
        ):
            raise ValueError("Document owner, course, or embedding model has an invalid value")
        if any(len(vector) != EMBEDDING_DIMENSIONS for vector in embeddings):
            raise ValueError(
                f"Stored vectors must have {EMBEDDING_DIMENSIONS} dimensions"
            )
        if any(not math.isfinite(float(value)) for vector in embeddings for value in vector):
            raise ValueError("Stored vectors cannot contain non-finite values")
        if any(not any(float(value) != 0.0 for value in vector) for vector in embeddings):
            raise ValueError("Stored vectors cannot be zero vectors")
        if any(
            chunk.document_id != document_id or chunk.course_id != course_id
            for chunk in chunks
        ):
            raise ValueError("Chunk ownership metadata does not match the document")

        document = Document(
            id=document_id,
            owner_id=owner_id,
            course_id=course_id,
            source_filename=extracted.source_filename,
            title=extracted.metadata.title,
            author=extracted.metadata.author,
            mime_type=extracted.metadata.mime_type,
            content_hash=content_hash,
            metadata_json={},
        )
        session.add(document)
        session.add_all(
            [
                DocumentChunk(
                    document_id=document_id,
                    owner_id=owner_id,
                    course_id=course_id,
                    chunk_index=chunk.chunk_index,
                    content=chunk.text,
                    page_number=chunk.page_number,
                    section_title=chunk.section_title,
                    source_filename=chunk.source_filename,
                    embedding=list(vector),
                    embedding_model=embedding_model,
                )
                for chunk, vector in zip(chunks, embeddings, strict=True)
            ]
        )
        await session.flush()
        return document_id

    async def search(
        self,
        session: AsyncSession,
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
        if len(query_embedding) != EMBEDDING_DIMENSIONS:
            raise ValueError(
                f"Query vector must have {EMBEDDING_DIMENSIONS} dimensions"
            )
        if (
            not user_id.strip()
            or len(user_id) > 255
            or not embedding_model.strip()
            or len(embedding_model) > 255
        ):
            raise ValueError("Search user or embedding model has an invalid value")
        if not all(math.isfinite(float(value)) for value in query_embedding):
            raise ValueError("Query vector cannot contain non-finite values")
        if not any(float(value) != 0.0 for value in query_embedding):
            raise ValueError("Query vector cannot be a zero vector")
        if top_k < 1 or candidate_limit < top_k:
            raise ValueError("candidate_limit must be at least top_k, and top_k positive")

        filters = self._access_filters(
            user_id,
            allowed_course_ids,
            embedding_model,
            course_id,
            document_ids,
        )
        distance = DocumentChunk.embedding.cosine_distance(list(query_embedding))
        semantic_query = (
            select(DocumentChunk, distance.label("distance"))
            .where(*filters)
            .order_by(distance)
            .limit(candidate_limit)
        )
        semantic_rows = (await session.execute(semantic_query)).all()

        text_vector = func.to_tsvector("simple", DocumentChunk.content)
        text_query = func.plainto_tsquery("simple", query_text)
        lexical_rank = func.ts_rank(text_vector, text_query)
        lexical_query = (
            select(DocumentChunk, lexical_rank.label("rank"))
            .where(*filters, text_vector.op("@@")(text_query))
            .order_by(lexical_rank.desc())
            .limit(candidate_limit)
        )
        lexical_rows = (await session.execute(lexical_query)).all()

        scores: dict[UUID, tuple[DocumentChunk, float, float]] = {}
        for chunk, distance_value in semantic_rows:
            semantic_score = max(0.0, min(1.0, 1.0 - float(distance_value)))
            scores[chunk.id] = (chunk, semantic_score, 0.0)
        for chunk, rank_value in lexical_rows:
            previous = scores.get(chunk.id)
            if previous is None:
                scores[chunk.id] = (chunk, 0.0, float(rank_value))
            else:
                scores[chunk.id] = (chunk, previous[1], float(rank_value))

        results = [
            (
                chunk,
                semantic_score * 0.75 + (lexical / (lexical + 1.0)) * 0.25,
            )
            for chunk, semantic_score, lexical in scores.values()
        ]
        results.sort(key=lambda result: result[1], reverse=True)
        return [
            RetrievedChunk(
                id=chunk.id,
                document_id=chunk.document_id,
                course_id=chunk.course_id,
                content=chunk.content,
                chunk_index=chunk.chunk_index,
                page_number=chunk.page_number,
                section_title=chunk.section_title,
                source_filename=chunk.source_filename,
                score=score,
            )
            for chunk, score in results[:top_k]
        ]

    @staticmethod
    def _access_filters(
        user_id: str,
        allowed_course_ids: Collection[str],
        embedding_model: str,
        course_id: str | None,
        document_ids: Collection[UUID] | None,
    ) -> list[ColumnElement[bool]]:
        permitted_scope = [DocumentChunk.owner_id == user_id]
        if allowed_course_ids:
            permitted_scope.append(DocumentChunk.course_id.in_(allowed_course_ids))
        filters: list[ColumnElement[bool]] = [
            or_(*permitted_scope),
            DocumentChunk.embedding_model == embedding_model,
        ]
        if course_id is not None:
            filters.append(DocumentChunk.course_id == course_id)
        if document_ids is not None:
            if not document_ids:
                filters.append(DocumentChunk.document_id.is_(None))
            else:
                filters.append(DocumentChunk.document_id.in_(document_ids))
        return filters
