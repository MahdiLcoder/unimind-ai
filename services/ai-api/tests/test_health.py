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


def test_request_correlation_id_is_returned() -> None:
    request_id = "0192bf8e-fc6e-7db1-aea8-2326ff210e14"
    with TestClient(app) as client:
        response = client.get(
            "/health/live",
            headers={"X-Request-ID": request_id},
        )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == request_id


def test_metrics_endpoint_requires_configured_bearer_token(monkeypatch) -> None:
    from pydantic import SecretStr

    from app.core.config import settings

    monkeypatch.setattr(settings, "metrics_bearer_token", SecretStr("metrics-secret"))
    with TestClient(app) as client:
        unauthorized = client.get("/metrics")
        authorized = client.get(
            "/metrics",
            headers={"Authorization": "Bearer metrics-secret"},
        )

    assert unauthorized.status_code == 401
    assert authorized.status_code == 200
    assert "unimind_http_requests_total" in authorized.text


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
