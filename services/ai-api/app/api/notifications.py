from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.database import get_db_session
from app.models.platform import UserNotification
from app.models.users import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: str
    title: str
    message: str
    resource_type: str | None
    resource_id: str | None
    read_at: datetime | None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> NotificationListResponse:
    rows = await session.scalars(
        select(UserNotification)
        .where(UserNotification.user_id == user.clerk_user_id)
        .order_by(UserNotification.created_at.desc(), UserNotification.id)
        .limit(limit)
    )
    items = list(rows)
    unread_count = await session.scalar(
        select(func.count(UserNotification.id)).where(
            UserNotification.user_id == user.clerk_user_id,
            UserNotification.read_at.is_(None),
        )
    )
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(item) for item in items],
        unread_count=unread_count or 0,
    )


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> NotificationResponse:
    notification = await session.scalar(
        select(UserNotification).where(
            UserNotification.id == notification_id,
            UserNotification.user_id == user.clerk_user_id,
        )
    )
    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification was not found",
        )
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(notification)
    return NotificationResponse.model_validate(notification)
