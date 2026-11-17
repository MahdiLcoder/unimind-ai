"""Persist user-requested summaries for saved research papers."""

import sqlalchemy as sa
from alembic import op

revision = "0014_research_paper_summary"
down_revision = "0013_quiz_exam_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "research_papers",
        sa.Column("summary", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("research_papers", "summary")
