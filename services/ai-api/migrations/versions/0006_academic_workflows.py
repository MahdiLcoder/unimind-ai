"""Add workspaces, courses, enrollments, planning, and quiz persistence."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_academic_workflows"
down_revision = "0005_create_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.clerk_user_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "workspace_members",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("clerk_user_id", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=16), server_default=sa.text("'member'"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('owner', 'member')", name="ck_workspace_members_role"
        ),
        sa.ForeignKeyConstraint(
            ["clerk_user_id"], ["users.clerk_user_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("workspace_id", "clerk_user_id"),
    )
    op.create_table(
        "courses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("professor_id", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["professor_id"], ["users.clerk_user_id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "code", name="uq_courses_workspace_code"),
    )
    op.create_index(
        "ix_courses_professor_created", "courses", ["professor_id", "created_at"]
    )
    op.create_table(
        "enrollments",
        sa.Column("course_id", sa.String(length=36), nullable=False),
        sa.Column("student_id", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column(
            "enrolled_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('active', 'dropped')", name="ck_enrollments_status"
        ),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["users.clerk_user_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("course_id", "student_id"),
    )
    op.create_index(
        "ix_enrollments_student_status", "enrollments", ["student_id", "status"]
    )
    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.String(length=255), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.Column("course_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column(
            "priority",
            sa.String(length=16),
            server_default=sa.text("'medium'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "owner_id IS NOT NULL OR course_id IS NOT NULL",
            name="ck_tasks_owner_or_course",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed')",
            name="ck_tasks_status",
        ),
        sa.CheckConstraint(
            "priority IN ('low', 'medium', 'high')", name="ck_tasks_priority"
        ),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.clerk_user_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.clerk_user_id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_owner_due", "tasks", ["owner_id", "due_at"])
    op.create_index("ix_tasks_course_due", "tasks", ["course_id", "due_at"])
    op.create_table(
        "study_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("starts_on", sa.Date(), nullable=True),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column(
            "schedule",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('active', 'completed', 'archived')",
            name="ck_study_plans_status",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.clerk_user_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_study_plans_owner_status", "study_plans", ["owner_id", "status"]
    )
    op.create_table(
        "quizzes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("creator_id", sa.String(length=255), nullable=False),
        sa.Column("course_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("published", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["creator_id"], ["users.clerk_user_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "quiz_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("quiz_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column(
            "options",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("answer_key", sa.String(length=500), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("points", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint("points > 0", name="ck_quiz_questions_points_positive"),
        sa.ForeignKeyConstraint(["quiz_id"], ["quizzes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("quiz_id", "position", name="uq_quiz_questions_position"),
    )
    op.create_index(
        "ix_quiz_questions_quiz_position",
        "quiz_questions",
        ["quiz_id", "position"],
    )
    op.create_table(
        "quiz_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("quiz_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column(
            "answers",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["quiz_id"], ["quizzes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.clerk_user_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_quiz_attempts_user_submitted",
        "quiz_attempts",
        ["user_id", "submitted_at"],
    )
    op.create_table(
        "research_papers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.String(length=255), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("abstract", sa.Text(), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column(
            "authors",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("doi", sa.String(length=255), nullable=True),
        sa.Column("url", sa.String(length=2048), nullable=True),
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
        "ix_research_papers_owner_created",
        "research_papers",
        ["owner_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_research_papers_owner_created", table_name="research_papers")
    op.drop_table("research_papers")
    op.drop_index("ix_quiz_attempts_user_submitted", table_name="quiz_attempts")
    op.drop_table("quiz_attempts")
    op.drop_index("ix_quiz_questions_quiz_position", table_name="quiz_questions")
    op.drop_table("quiz_questions")
    op.drop_table("quizzes")
    op.drop_index("ix_study_plans_owner_status", table_name="study_plans")
    op.drop_table("study_plans")
    op.drop_index("ix_tasks_owner_due", table_name="tasks")
    op.drop_index("ix_tasks_course_due", table_name="tasks")
    op.drop_table("tasks")
    op.drop_index("ix_enrollments_student_status", table_name="enrollments")
    op.drop_table("enrollments")
    op.drop_index("ix_courses_professor_created", table_name="courses")
    op.drop_table("courses")
    op.drop_table("workspace_members")
    op.drop_table("workspaces")
