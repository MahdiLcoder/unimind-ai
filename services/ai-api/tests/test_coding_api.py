from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.api import coding
from app.api.auth import get_current_user
from app.main import app
from app.models.users import User


class RunnerResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return {
            "exit_code": 0,
            "stdout": "hello\n",
            "stderr": "",
            "timed_out": False,
        }


class RunnerClient:
    def __init__(self, *, timeout: float) -> None:
        assert timeout == 10

    async def __aenter__(self) -> RunnerClient:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def post(self, url: str, *, json: dict[str, str]) -> RunnerResponse:
        assert url == "http://runner:8081/execute"
        assert json == {"code": "print('hello')"}
        return RunnerResponse()


def _user() -> User:
    return User(
        clerk_user_id="student-1",
        email=None,
        role="student",
        created_at=datetime.now(UTC),
    )


def test_authenticated_student_can_execute_python(monkeypatch) -> None:
    monkeypatch.setattr(coding.settings, "code_runner_url", "http://runner:8081")
    monkeypatch.setattr(coding.httpx, "AsyncClient", RunnerClient)
    app.dependency_overrides[get_current_user] = _user
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/coding/execute",
                json={"code": "print('hello')"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert response.json() == {
        "exit_code": 0,
        "stdout": "hello\n",
        "stderr": "",
        "timed_out": False,
    }


def test_code_execution_is_unavailable_without_a_runner(monkeypatch) -> None:
    monkeypatch.setattr(coding.settings, "code_runner_url", None)
    app.dependency_overrides[get_current_user] = _user
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/coding/execute",
                json={"code": "print('hello')"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 503


def test_code_execution_rejects_oversized_source() -> None:
    app.dependency_overrides[get_current_user] = _user
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/coding/execute",
                json={"code": "x" * 8_001},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 422
