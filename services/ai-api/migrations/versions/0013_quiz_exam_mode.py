"""Distinguish mock exams from practice quizzes."""

import sqlalchemy as sa
from alembic import op

revision = "0013_quiz_exam_mode"
down_revision = "0012_user_profile_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "quizzes",
        sa.Column(
            "assessment_type",
            sa.String(length=16),
            server_default="practice",
            nullable=False,
        ),
    )
    op.add_column(
        "quizzes",
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_quizzes_assessment_type",
        "quizzes",
        "assessment_type IN ('practice', 'mock_exam')",
    )
    op.create_check_constraint(
        "ck_quizzes_duration",
        "quizzes",
        "(assessment_type = 'practice' AND duration_minutes IS NULL) OR "
        "(assessment_type = 'mock_exam' AND duration_minutes >= 5)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_quizzes_duration", "quizzes", type_="check")
    op.drop_constraint("ck_quizzes_assessment_type", "quizzes", type_="check")
    op.drop_column("quizzes", "duration_minutes")
    op.drop_column("quizzes", "assessment_type")
