"""Create document and vector chunk tables."""

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = "0002_create_rag_documents"
down_revision = "0001_enable_pgvector"
branch_labels = None
depends_on = None

EMBEDDING_DIMENSIONS = 1024


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", sa.String(length=255), nullable=False),
        sa.Column("course_id", sa.String(length=255), nullable=True),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=True),
        sa.Column("author", sa.String(length=512), nullable=True),
        sa.Column("mime_type", sa.String(length=127), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_documents_owner_course", "documents", ["owner_id", "course_id"])
    op.create_table(
        "document_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_id", sa.String(length=255), nullable=False),
        sa.Column("course_id", sa.String(length=255), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("section_title", sa.String(length=512), nullable=True),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIMENSIONS), nullable=False),
        sa.Column("embedding_model", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("document_id", "chunk_index", name="uq_document_chunks_index"),
    )
    op.create_index(
        "ix_document_chunks_scope",
        "document_chunks",
        ["owner_id", "course_id", "document_id"],
    )
    op.create_index(
        "ix_document_chunks_embedding_hnsw",
        "document_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"m": 16, "ef_construction": 64},
    )
    op.create_index(
        "ix_document_chunks_content_fts",
        "document_chunks",
        [sa.text("to_tsvector('simple', content)")],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("ix_document_chunks_content_fts", table_name="document_chunks")
    op.drop_index("ix_document_chunks_embedding_hnsw", table_name="document_chunks")
    op.drop_index("ix_document_chunks_scope", table_name="document_chunks")
    op.drop_table("document_chunks")
    op.drop_index("ix_documents_owner_course", table_name="documents")
    op.drop_table("documents")
