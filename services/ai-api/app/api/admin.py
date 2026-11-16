from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_roles
from app.api.courses import WorkspaceResponse
from app.core.database import get_db_session
from app.core.platform import DEFAULT_PLATFORM_FLAGS, add_audit_log
from app.models.academic import Course, Workspace
from app.models.documents import Document
from app.models.platform import AuditLog, PlatformSetting
from app.models.users import User, UserRole

router = APIRouter(prefix="/admin", tags=["administration"])
AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMINISTRATOR))]


class PlatformFeatureResponse(BaseModel):
    key: str
    enabled: bool


class PlatformFeaturesResponse(BaseModel):
    features: list[PlatformFeatureResponse]


class PlatformFeatureUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_id: str
    action: str
    resource_type: str
    resource_id: str | None
    details: dict[str, object]
    created_at: datetime


class AdminWorkspaceResponse(WorkspaceResponse):
    course_count: int


@router.get("/features", response_model=PlatformFeaturesResponse)
async def get_platform_features(
    _admin: AdminUser,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlatformFeaturesResponse:
    values = {
        row.key: row.enabled
        for row in await session.scalars(select(PlatformSetting))
    }
    return PlatformFeaturesResponse(
        features=[
            PlatformFeatureResponse(
                key=key,
                enabled=values.get(key, default),
            )
            for key, default in DEFAULT_PLATFORM_FLAGS.items()
        ]
    )


@router.put("/features/{feature_key}", response_model=PlatformFeatureResponse)
async def update_platform_feature(
    feature_key: str,
    body: PlatformFeatureUpdate,
    admin: AdminUser,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlatformFeatureResponse:
    if feature_key not in DEFAULT_PLATFORM_FLAGS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Platform feature was not found",
        )
    setting = await session.get(PlatformSetting, feature_key)
    previous_value = (
        setting.enabled if setting is not None else DEFAULT_PLATFORM_FLAGS[feature_key]
    )
    if setting is None:
        setting = PlatformSetting(
            key=feature_key,
            enabled=body.enabled,
            updated_by=admin.clerk_user_id,
        )
        session.add(setting)
    else:
        setting.enabled = body.enabled
        setting.updated_by = admin.clerk_user_id
    if previous_value != body.enabled:
        add_audit_log(
            session,
            actor_id=admin.clerk_user_id,
            action="platform_feature_updated",
            resource_type="platform_feature",
            resource_id=feature_key,
            details={"previous_enabled": previous_value, "enabled": body.enabled},
        )
    await session.commit()
    return PlatformFeatureResponse(key=feature_key, enabled=body.enabled)


@router.get("/workspaces", response_model=list[AdminWorkspaceResponse])
async def list_platform_workspaces(
    _admin: AdminUser,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[AdminWorkspaceResponse]:
    rows = await session.execute(
        select(Workspace, func.count(Course.id).label("course_count"))
        .outerjoin(Course, Course.workspace_id == Workspace.id)
        .group_by(Workspace.id)
        .order_by(Workspace.created_at.desc(), Workspace.id)
        .limit(limit)
        .offset(offset)
    )
    return [
        AdminWorkspaceResponse(
            **WorkspaceResponse.model_validate(workspace).model_dump(),
            course_count=course_count,
        )
        for workspace, course_count in rows
    ]


@router.delete(
    "/workspaces/{workspace_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_platform_workspace(
    workspace_id: UUID,
    admin: AdminUser,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace was not found",
        )
    add_audit_log(
        session,
        actor_id=admin.clerk_user_id,
        action="workspace_deleted",
        resource_type="workspace",
        resource_id=str(workspace_id),
        details={"name": workspace.name},
    )
    course_ids = await session.scalars(
        select(Course.id).where(Course.workspace_id == workspace_id)
    )
    ids = list(course_ids)
    if ids:
        await session.execute(
            delete(Document).where(Document.course_id.in_(ids))
        )
    await session.delete(workspace)
    await session.commit()


@router.get("/audit-logs", response_model=list[AuditLogResponse])
async def list_audit_logs(
    _admin: AdminUser,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[AuditLogResponse]:
    rows = await session.scalars(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc(), AuditLog.id)
        .limit(limit)
        .offset(offset)
    )
    return [AuditLogResponse.model_validate(row) for row in rows]
