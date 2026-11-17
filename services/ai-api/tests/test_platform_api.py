from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.database import get_db_session
from app.main import app
from app.models.platform import AuditLog, PlatformSetting, UserNotification
from app.models.users import User


class PlatformSession:
    def __init__(self) -> None:
        self.settings: dict[str, PlatformSetting] = {}
        self.notifications: dict[object, UserNotification] = {}
        self.added: list[object] = []
        self.commits = 0

    async def scalar(self, statement: object) -> object | None:
        sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
        if "user_id = 'user-1'" in sql:
            return next(
                (
                    item
                    for item in self.notifications.values()
                    if item.user_id == "user-1"
                ),
                None,
            )
        return None

    async def get(self, model: type, key: object) -> object | None:
        if model is PlatformSetting:
            return self.settings.get(key)
        if model is UserNotification:
            return self.notifications.get(key)
        raise AssertionError(f"Unexpected model lookup: {model.__name__}")

    def add(self, item: object) -> None:
        self.added.append(item)
        if isinstance(item, PlatformSetting):
            self.settings[item.key] = item
        if isinstance(item, UserNotification):
            self.notifications[item.id] = item

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, _item: object) -> None:
        return None


def _user(role: str = "administrator") -> User:
    return User(
        clerk_user_id="user-1",
        email=None,
        role=role,
        created_at=datetime.now(UTC),
    )


def _client(session: PlatformSession, role: str = "administrator") -> TestClient:
    async def override_session():
        yield cast(AsyncSession, session)

    app.dependency_overrides[get_current_user] = lambda: _user(role)
    app.dependency_overrides[get_db_session] = override_session
    return TestClient(app)


def _clear_overrides() -> None:
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db_session, None)


def test_admin_can_change_allowlisted_feature_and_audit_change() -> None:
    session = PlatformSession()
    try:
        with _client(session) as client:
            response = client.put(
                "/api/v1/admin/features/research_search_enabled",
                json={"enabled": False},
            )
    finally:
        _clear_overrides()

    assert response.status_code == 200
    assert response.json() == {"key": "research_search_enabled", "enabled": False}
    assert session.settings["research_search_enabled"].updated_by == "user-1"
    logs = [item for item in session.added if isinstance(item, AuditLog)]
    assert len(logs) == 1
    assert logs[0].details == {"previous_enabled": True, "enabled": False}


def test_admin_cannot_write_unknown_platform_configuration() -> None:
    try:
        with _client(PlatformSession()) as client:
            response = client.put(
                "/api/v1/admin/features/ollama_password",
                json={"enabled": True},
            )
    finally:
        _clear_overrides()

    assert response.status_code == 404


def test_students_cannot_read_platform_features_or_audit_logs() -> None:
    try:
        with _client(PlatformSession(), role="student") as client:
            features = client.get("/api/v1/admin/features")
            logs = client.get("/api/v1/admin/audit-logs")
            agent_runs = client.get("/api/v1/admin/agent-runs")
    finally:
        _clear_overrides()

    assert features.status_code == 403
    assert logs.status_code == 403
    assert agent_runs.status_code == 403


def test_notification_read_state_is_saved_and_user_owned() -> None:
    session = PlatformSession()
    notification = UserNotification(
        id=uuid4(),
        user_id="user-1",
        kind="course_assignment",
        title="New assignment",
        message="Read chapter",
        created_at=datetime.now(UTC),
    )
    session.notifications[notification.id] = notification
    try:
        with _client(session, role="student") as client:
            response = client.post(
                f"/api/v1/notifications/{notification.id}/read"
            )
    finally:
        _clear_overrides()

    assert response.status_code == 200
    assert response.json()["read_at"] is not None
    assert session.commits == 1


def test_notifications_cannot_be_read_by_another_user() -> None:
    session = PlatformSession()
    notification = UserNotification(
        id=uuid4(),
        user_id="somebody-else",
        kind="course_assignment",
        title="Private",
        message="Private",
        created_at=datetime.now(UTC),
    )
    session.notifications[notification.id] = notification
    try:
        with _client(session, role="student") as client:
            response = client.post(
                f"/api/v1/notifications/{notification.id}/read"
            )
    finally:
        _clear_overrides()

    assert response.status_code == 404
