from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.api.auth import get_current_user
from app.main import app
from app.models.users import User


def test_current_user_profile_is_returned_with_server_role() -> None:
    app.dependency_overrides[get_current_user] = lambda: User(
        clerk_user_id="user_clerk_123",
        email="student@example.edu",
        role="student",
        created_at=datetime.now(UTC),
    )
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/users/me")
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert response.json()["clerk_user_id"] == "user_clerk_123"
    assert response.json()["role"] == "student"


def test_current_user_profile_requires_a_bearer_token() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/users/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authenticated university identity is required"
