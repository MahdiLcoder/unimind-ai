from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.api.auth import get_current_user
from app.core.database import get_db_session
from app.main import app
from app.models.users import User


class RoleSession:
    def __init__(self, users: dict[str, User], administrator_count: int) -> None:
        self.users = users
        self.administrator_count = administrator_count

    async def get(self, model: type, key: str) -> User | None:
        return self.users.get(key)

    async def scalar(self, _statement: object) -> int:
        return self.administrator_count

    async def commit(self) -> None:
        return None

    async def refresh(self, _user: User) -> None:
        return None


def _admin(user_id: str = "user_admin") -> User:
    return User(
        clerk_user_id=user_id,
        email=None,
        role="administrator",
        created_at=datetime.now(UTC),
    )


def _override_role_dependencies(
    admin: User,
    session: RoleSession,
) -> None:
    async def override_session():
        yield session

    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db_session] = override_session


def _clear_role_overrides() -> None:
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db_session, None)


def test_student_cannot_list_or_promote_users() -> None:
    app.dependency_overrides[get_current_user] = lambda: User(
        clerk_user_id="user_student",
        email=None,
        role="student",
        created_at=datetime.now(UTC),
    )
    try:
        with TestClient(app) as client:
            list_response = client.get("/api/v1/users")
            role_response = client.patch(
                "/api/v1/users/user_professor/role",
                json={"role": "administrator"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert list_response.status_code == 403
    assert role_response.status_code == 403


def test_role_update_rejects_unknown_role_values() -> None:
    app.dependency_overrides[get_current_user] = lambda: User(
        clerk_user_id="user_admin",
        email=None,
        role="administrator",
        created_at=datetime.now(UTC),
    )
    try:
        with TestClient(app) as client:
            response = client.patch(
                "/api/v1/users/user_professor/role",
                json={"role": "superuser"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 422


def test_administrator_cannot_demote_themselves() -> None:
    administrator = _admin()
    session = RoleSession({administrator.clerk_user_id: administrator}, 1)
    _override_role_dependencies(administrator, session)
    try:
        with TestClient(app) as client:
            response = client.patch(
                f"/api/v1/users/{administrator.clerk_user_id}/role",
                json={"role": "professor"},
            )
    finally:
        _clear_role_overrides()

    assert response.status_code == 409
    assert administrator.role == "administrator"


def test_last_administrator_cannot_be_demoted() -> None:
    administrator = _admin()
    target = _admin("user_other_admin")
    session = RoleSession({target.clerk_user_id: target}, 1)
    _override_role_dependencies(administrator, session)
    try:
        with TestClient(app) as client:
            response = client.patch(
                f"/api/v1/users/{target.clerk_user_id}/role",
                json={"role": "professor"},
            )
    finally:
        _clear_role_overrides()

    assert response.status_code == 409
    assert target.role == "administrator"
