from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AgentExecutionEvent(Base):
    __tablename__ = "agent_execution_events"
    __table_args__ = (
        Index(
            "ix_agent_events_user_conversation_created",
            "user_id",
            "conversation_id",
            "created_at",
        ),
        Index("ix_agent_events_request", "request_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    conversation_id: Mapped[UUID] = mapped_column(nullable=False)
    request_id: Mapped[UUID] = mapped_column(nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    agent_name: Mapped[str | None] = mapped_column(String(32), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
