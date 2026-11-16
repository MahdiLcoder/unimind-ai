"""Persist multi-agent execution events."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_agent_execution_events"
down_revision = "0002_create_rag_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_execution_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("agent_name", sa.String(length=32), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_agent_events_user_conversation_created",
        "agent_execution_events",
        ["user_id", "conversation_id", "created_at"],
    )
    op.create_index(
        "ix_agent_events_request",
        "agent_execution_events",
        ["request_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_agent_events_request", table_name="agent_execution_events")
    op.drop_index(
        "ix_agent_events_user_conversation_created",
        table_name="agent_execution_events",
    )
    op.drop_table("agent_execution_events")
