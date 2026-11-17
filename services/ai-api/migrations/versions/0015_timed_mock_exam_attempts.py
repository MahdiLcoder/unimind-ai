"""Persist and enforce timed mock-exam attempts."""

import sqlalchemy as sa
from alembic import op

revision = "0015_timed_mock_exam_attempts"
down_revision = "0014_research_paper_summary"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "quiz_attempts",
        sa.Column(
            "status",
            sa.String(length=16),
            server_default="submitted",
            nullable=False,
        ),
    )
    op.add_column(
        "quiz_attempts",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_quiz_attempts_status",
        "quiz_attempts",
        "status IN ('in_progress', 'submitted', 'expired')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_quiz_attempts_status", "quiz_attempts", type_="check")
    op.drop_column("quiz_attempts", "started_at")
    op.drop_column("quiz_attempts", "status")
