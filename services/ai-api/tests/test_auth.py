from unittest.mock import AsyncMock

import pytest
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import auth
from app.models.users import User, UserRole


class StubVerifier:
    def __init__(self, user_id: str) -> None:
        self.user_id = user_id

    async def verify(self, _token: str) -> dict[str, str]:
        return {"sub": self.user_id}


@pytest.mark.asyncio
async def test_bootstrap_admin_promotes_existing_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = "user_bootstrap_admin_123"
    user = User(clerk_user_id=user_id, role=UserRole.STUDENT.value)
    session = AsyncMock(spec=AsyncSession)
    session.get.return_value = user
    monkeypatch.setattr(auth, "_verifier", StubVerifier(user_id))
    monkeypatch.setattr(auth.settings, "admin_clerk_user_ids", user_id)

    result = await auth.get_current_user(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token"),
        session,
    )

    assert result.role == UserRole.ADMINISTRATOR.value
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_unlisted_existing_user_keeps_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = "user_student_123"
    user = User(clerk_user_id=user_id, role=UserRole.STUDENT.value)
    session = AsyncMock(spec=AsyncSession)
    session.get.return_value = user
    monkeypatch.setattr(auth, "_verifier", StubVerifier(user_id))
    monkeypatch.setattr(auth.settings, "admin_clerk_user_ids", "")

    await auth.get_current_user(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token"),
        session,
    )

    assert user.role == UserRole.STUDENT.value
    session.commit.assert_not_awaited()
