"""Persist AI-generated learning lessons."""

import sqlalchemy as sa
from alembic import op

revision = "0010_persist_learning_lessons"
down_revision = "0009_assignment_submissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learning_lessons",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.String(length=255), nullable=False),
        sa.Column("course_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.clerk_user_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_learning_lessons_owner_created",
        "learning_lessons",
        ["owner_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_learning_lessons_owner_created", table_name="learning_lessons")
    op.drop_table("learning_lessons")
