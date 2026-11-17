"""Persist per-user research search history."""

import sqlalchemy as sa
from alembic import op

revision = "0011_research_search_history"
down_revision = "0010_persist_learning_lessons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_search_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.String(length=255), nullable=False),
        sa.Column("query", sa.String(length=300), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.clerk_user_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_research_search_history_owner_created",
        "research_search_history",
        ["owner_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_research_search_history_owner_created",
        table_name="research_search_history",
    )
    op.drop_table("research_search_history")
