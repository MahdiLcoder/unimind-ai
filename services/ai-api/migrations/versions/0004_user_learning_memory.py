"""Persist user-isolated learning preferences and progress."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_user_learning_memory"
down_revision = "0003_agent_execution_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_learning_memory",
        sa.Column("user_id", sa.String(length=255), primary_key=True),
        sa.Column(
            "preferences_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "progress_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("user_learning_memory")
