from __future__ import annotations

import os
from uuid import uuid4

import pytest
from ai.rag.chunking import Chunk
from ai.rag.ingestion import ExtractedDocument, ExtractedSegment, ExtractionMetadata
from ai.rag.postgres import PostgresRAGRepository
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.mark.asyncio
async def test_pgvector_hybrid_search_and_access_filters() -> None:
    database_url = os.getenv("RAG_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set RAG_TEST_DATABASE_URL to run the PostgreSQL integration test")

    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    repository = PostgresRAGRepository()
    vector_a = [1.0] + [0.0] * 1023
    vector_b = [0.0, 1.0] + [0.0] * 1022
    document_specs = (
        ("user-a", None, "Library hours are 8 to 20.", vector_a),
        ("user-b", "course-a", "The campus library opens at eight.", vector_b),
        ("user-b", "course-secret", "Library hours are secret.", vector_a),
    )

    try:
        async with session_factory() as session:
            try:
                async with session.begin_nested():
                    for owner_id, course_id, content, vector in document_specs:
                        document_id = uuid4()
                        extracted = ExtractedDocument(
                            source_filename="university-guide.txt",
                            segments=(ExtractedSegment(content),),
                            metadata=ExtractionMetadata(mime_type="text/plain"),
                        )
                        chunk = Chunk(
                            text=content,
                            document_id=document_id,
                            course_id=course_id,
                            chunk_index=0,
                            page_number=None,
                            section_title=None,
                            source_filename=extracted.source_filename,
                        )
                        await repository.index_document(
                            session,
                            owner_id=owner_id,
                            course_id=course_id,
                            extracted=extracted,
                            document_id=document_id,
                            chunks=[chunk],
                            embeddings=[vector],
                            embedding_model="integration-test-model",
                            content_hash="a" * 64,
                        )

                    results = await repository.search(
                        session,
                        query_text="library hours",
                        query_embedding=vector_a,
                        user_id="user-a",
                        allowed_course_ids={"course-a"},
                        embedding_model="integration-test-model",
                        top_k=10,
                        candidate_limit=10,
                    )

                    assert len(results) == 2
                    assert all(result.course_id != "course-secret" for result in results)
                    assert {result.source_filename for result in results} == {
                        "university-guide.txt"
                    }
                    assert results[0].score > results[1].score
            finally:
                await session.rollback()
    finally:
        await engine.dispose()
