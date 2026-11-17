from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserRole(StrEnum):
    STUDENT = "student"
    PROFESSOR = "professor"
    ADMINISTRATOR = "administrator"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('student', 'professor', 'administrator')",
            name="ck_users_role",
        ),
        Index("ix_users_role_created_at", "role", "created_at"),
    )

    clerk_user_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    role: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=UserRole.STUDENT.value,
        server_default=text("'student'"),
    )
    display_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    university: Mapped[str | None] = mapped_column(String(200), nullable=True)
    department: Mapped[str | None] = mapped_column(String(160), nullable=True)
    program: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
