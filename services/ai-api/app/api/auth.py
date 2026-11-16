from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db_session
from app.core.identity import (
    ClerkTokenVerifier,
    IdentityProviderUnavailable,
    InvalidIdentityToken,
)
from app.models.users import User, UserRole

_bearer_scheme = HTTPBearer(auto_error=False)
_verifier = ClerkTokenVerifier(
    jwks_url=settings.clerk_jwks_url,
    issuer=settings.clerk_issuer,
    authorized_parties=settings.authorized_clerk_parties,
)


async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer_scheme),
    ],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated university identity is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = await _verifier.verify(credentials.credentials)
    except InvalidIdentityToken as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated university identity is required",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except IdentityProviderUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identity provider verification is unavailable",
        ) from exc

    clerk_user_id = claims["sub"]
    user = await session.get(User, clerk_user_id)
    if user is None:
        email = claims.get("email")
        if not isinstance(email, str) or claims.get("email_verified") is not True:
            email = None
        role = (
            UserRole.ADMINISTRATOR.value
            if clerk_user_id in settings.bootstrap_admin_user_ids
            else UserRole.STUDENT.value
        )
        statement = (
            insert(User)
            .values(clerk_user_id=clerk_user_id, email=email, role=role)
            .on_conflict_do_nothing(index_elements=[User.clerk_user_id])
        )
        await session.execute(statement)
        await session.commit()
        user = await session.scalar(
            select(User).where(User.clerk_user_id == clerk_user_id)
        )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not provision the authenticated user",
        )
    return user


def require_roles(*roles: UserRole) -> Callable[..., Awaitable[User]]:
    allowed_roles = frozenset(role.value for role in roles)

    async def role_guard(
        user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is not authorized to perform this action",
            )
        return user

    return role_guard
