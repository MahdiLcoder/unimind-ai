"""Create application users and role assignments."""

import sqlalchemy as sa
from alembic import op

revision = "0005_create_users"
down_revision = "0004_user_learning_memory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("clerk_user_id", sa.String(length=255), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column(
            "role",
            sa.String(length=32),
            server_default=sa.text("'student'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('student', 'professor', 'administrator')",
            name="ck_users_role",
        ),
    )
    op.create_index("ix_users_role_created_at", "users", ["role", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_users_role_created_at", table_name="users")
    op.drop_table("users")
