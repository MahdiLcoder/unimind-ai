from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user, require_roles
from app.core.database import get_db_session
from app.core.platform import add_audit_log
from app.models.users import User, UserRole
from app.schemas.users import UserProfileResponse

router = APIRouter(prefix="/users", tags=["users"])
AdminUser = Annotated[
    User,
    Depends(require_roles(UserRole.ADMINISTRATOR)),
]


class UserRoleUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: UserRole


@router.get("/me", response_model=UserProfileResponse)
async def get_profile(
    user: Annotated[User, Depends(get_current_user)],
) -> UserProfileResponse:
    return UserProfileResponse.model_validate(user)


@router.get("", response_model=list[UserProfileResponse])
async def list_users(
    _admin: AdminUser,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    query: Annotated[str | None, Query(max_length=320)] = None,
) -> list[UserProfileResponse]:
    statement = select(User)
    search = query.strip() if query else ""
    if search:
        statement = statement.where(
            User.email.ilike(f"%{search}%")
            | User.clerk_user_id.ilike(f"%{search}%")
        )
    result = await session.scalars(
        statement.order_by(User.created_at.desc(), User.clerk_user_id)
        .limit(limit)
        .offset(offset)
    )
    return [UserProfileResponse.model_validate(user) for user in result]


@router.patch("/{clerk_user_id}/role", response_model=UserProfileResponse)
async def update_user_role(
    clerk_user_id: str,
    body: UserRoleUpdateRequest,
    admin: AdminUser,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserProfileResponse:
    user = await session.get(User, clerk_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User was not found",
        )
    if (
        clerk_user_id == admin.clerk_user_id
        and body.role != UserRole.ADMINISTRATOR
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Administrators cannot remove their own administrator role",
        )
    if (
        user.role == UserRole.ADMINISTRATOR.value
        and body.role != UserRole.ADMINISTRATOR
    ):
        administrator_count = await session.scalar(
            select(func.count(User.clerk_user_id)).where(
                User.role == UserRole.ADMINISTRATOR.value
            )
        )
        if administrator_count is not None and administrator_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The last administrator role cannot be removed",
            )
    previous_role = user.role
    user.role = body.role.value
    if previous_role != body.role.value:
        add_audit_log(
            session,
            actor_id=admin.clerk_user_id,
            action="user_role_updated",
            resource_type="user",
            resource_id=clerk_user_id,
            details={"previous_role": previous_role, "role": body.role.value},
        )
    await session.commit()
    await session.refresh(user)
    return UserProfileResponse.model_validate(user)
