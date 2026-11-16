from fastapi.testclient import TestClient

from app.api import health
from app.main import app


def test_root_database_url_encodes_credentials() -> None:
    from app.core.config import Settings

    settings = Settings(
        _env_file=None,
        database_url=None,
        postgres_password="p@ss:word",
        postgres_host="postgres",
    )

    assert settings.sqlalchemy_database_url == (
        "postgresql+asyncpg://unimind:p%40ss%3Aword@postgres:5432/unimind"
    )


def test_liveness_is_independent_of_dependencies() -> None:
    with TestClient(app) as client:
        response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_legacy_health_endpoint_remains_available() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_readiness_reports_database_and_cache(monkeypatch) -> None:
    async def healthy() -> str:
        return "healthy"

    monkeypatch.setattr(health, "check_database", healthy)
    monkeypatch.setattr(health, "check_cache", healthy)

    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "checks": {"database": "healthy", "cache": "healthy"},
    }


def test_readiness_fails_when_a_dependency_is_unavailable(monkeypatch) -> None:
    async def unavailable() -> str:
        return "unavailable"

    monkeypatch.setattr(health, "check_database", unavailable)
    monkeypatch.setattr(health, "check_cache", unavailable)

    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["detail"]["status"] == "unavailable"


def test_frontend_connection_endpoint() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/test")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "message": "Frontend successfully connected to UniMind AI API",
    }
