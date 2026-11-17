"""Add app-owned editable profile fields."""

import sqlalchemy as sa
from alembic import op

revision = "0012_user_profile_fields"
down_revision = "0011_research_search_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(length=160), nullable=True))
    op.add_column("users", sa.Column("university", sa.String(length=200), nullable=True))
    op.add_column("users", sa.Column("department", sa.String(length=160), nullable=True))
    op.add_column("users", sa.Column("program", sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "program")
    op.drop_column("users", "department")
    op.drop_column("users", "university")
    op.drop_column("users", "display_name")
