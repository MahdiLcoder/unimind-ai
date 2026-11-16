from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.agents import get_agent_service
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
