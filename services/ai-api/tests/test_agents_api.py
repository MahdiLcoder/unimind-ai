from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.agents import get_agent_principal, get_agent_service
from app.main import app


def test_agent_endpoint_requires_a_trusted_authenticated_principal() -> None:
    app.dependency_overrides[get_agent_service] = lambda: None
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/agents",
                json={
                    "conversation_id": str(uuid4()),
                    "message": "Create a quiz",
                },
            )
    finally:
        app.dependency_overrides.pop(get_agent_service, None)

    assert response.status_code == 401
    assert response.json()["detail"] == "Authenticated university identity is required"


def test_agent_service_initializes_before_authenticated_database_dependencies() -> None:
    dependency_order: list[str] = []

    def service_override() -> None:
        dependency_order.append("service")

    def principal_override() -> None:
        dependency_order.append("principal")
        raise HTTPException(status_code=401)

    app.dependency_overrides[get_agent_service] = service_override
    app.dependency_overrides[get_agent_principal] = principal_override
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/agents",
                json={
                    "conversation_id": str(uuid4()),
                    "message": "Test lazy service initialization order",
                },
            )
    finally:
        app.dependency_overrides.pop(get_agent_service, None)
        app.dependency_overrides.pop(get_agent_principal, None)

    assert response.status_code == 401
    assert dependency_order == ["service", "principal"]
