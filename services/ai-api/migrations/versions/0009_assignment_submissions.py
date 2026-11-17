"""Add course assignment submissions and review state."""

import sqlalchemy as sa
from alembic import op

revision = "0009_assignment_submissions"
down_revision = "0008_platform_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assignment_submissions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'submitted'"),
            nullable=False,
        ),
        sa.Column("grade", sa.Integer(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.String(length=255), nullable=True),
        sa.CheckConstraint(
            "status IN ('submitted', 'reviewed')",
            name="ck_assignment_submissions_status",
        ),
        sa.CheckConstraint(
            "grade IS NULL OR (grade >= 0 AND grade <= 100)",
            name="ck_assignment_submissions_grade",
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["student_id"], ["users.clerk_user_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"], ["users.clerk_user_id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "task_id", "student_id", name="uq_assignment_submissions_task_student"
        ),
    )
    op.create_index(
        "ix_assignment_submissions_task_status",
        "assignment_submissions",
        ["task_id", "status"],
    )
    op.create_index(
        "ix_assignment_submissions_student_submitted",
        "assignment_submissions",
        ["student_id", "submitted_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assignment_submissions_student_submitted",
        table_name="assignment_submissions",
    )
    op.drop_index(
        "ix_assignment_submissions_task_status",
        table_name="assignment_submissions",
    )
    op.drop_table("assignment_submissions")