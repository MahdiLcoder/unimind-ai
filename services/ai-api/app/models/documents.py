from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

EMBEDDING_DIMENSIONS = 1024


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_owner_course", "owner_id", "course_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[str] = mapped_column(String(255), nullable=False)
    course_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    author: Mapped[str | None] = mapped_column(String(512), nullable=True)
    mime_type: Mapped[str] = mapped_column(String(127), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    chunks: Mapped[list[DocumentChunk]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_document_chunks_index"),
        Index("ix_document_chunks_scope", "owner_id", "course_id", "document_id"),
        Index(
            "ix_document_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
            postgresql_with={"m": 16, "ef_construction": 64},
        ),
        Index(
            "ix_document_chunks_content_fts",
            text("to_tsvector('simple', content)"),
            postgresql_using="gin",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    owner_id: Mapped[str] = mapped_column(String(255), nullable=False)
    course_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS), nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    document: Mapped[Document] = relationship(back_populates="chunks")
