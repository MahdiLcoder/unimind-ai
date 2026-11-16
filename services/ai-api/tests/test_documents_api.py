from datetime import UTC, datetime
from uuid import UUID

import pytest
from ai.rag.service import RetrievalResult
from fastapi.testclient import TestClient

from app.api.auth import get_current_user
from app.api.dependencies import get_rag_service
from app.core.database import get_db_session
from app.main import app
from app.models.users import User

USER_ID = "user_clerk_123"
DOCUMENT_ID = UUID("f829c03c-d1ae-4a2c-a1ed-4e98fd5a0f5a")


class FakeRAGService:
    def __init__(self) -> None:
        self.ingest_args: dict[str, object] | None = None
        self.ingest_error: ValueError | None = None
        self.retrieve_args: dict[str, object] | None = None

    async def ingest(self, session: object, **kwargs: object) -> UUID:
        self.ingest_args = {"session": session, **kwargs}
        if self.ingest_error is not None:
            raise self.ingest_error
        return DOCUMENT_ID

    async def retrieve(self, session: object, query: str, **kwargs: object) -> RetrievalResult:
        self.retrieve_args = {"session": session, "query": query, **kwargs}
        return RetrievalResult(query=query, chunks=(), latency_ms=0)


class FakeSession:
    def __init__(self) -> None:
        self.statement = None
        self.course_ids: list[str] = []

    async def scalar(self, statement: object) -> None:
        self.statement = statement
        return None

    async def scalars(self, statement: object) -> list[object]:
        self.statement = statement
        return self.course_ids


@pytest.fixture
def authenticated_document_api():
    rag_service = FakeRAGService()
    session = FakeSession()
    app.dependency_overrides[get_current_user] = lambda: User(
        clerk_user_id=USER_ID,
        email=None,
        role="student",
        created_at=datetime.now(UTC),
    )
    app.dependency_overrides[get_rag_service] = lambda: rag_service

    async def override_session():
        yield session

    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            yield client, rag_service, session
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_rag_service, None)
        app.dependency_overrides.pop(get_db_session, None)


def test_upload_uses_the_authenticated_owner_and_safe_filename(
    authenticated_document_api,
) -> None:
    client, rag_service, _session = authenticated_document_api

    response = client.post(
        "/api/v1/documents",
        files={"file": ("../lecture.pdf", b"%PDF-1.4 document", "application/pdf")},
    )

    assert response.status_code == 201
    assert response.json()["id"] == str(DOCUMENT_ID)
    assert rag_service.ingest_args is not None
    assert rag_service.ingest_args["owner_id"] == USER_ID
    assert rag_service.ingest_args["filename"] == "lecture.pdf"


def test_search_uses_only_the_authenticated_user_scope(
    authenticated_document_api,
) -> None:
    client, rag_service, _session = authenticated_document_api

    response = client.post(
        "/api/v1/documents/search",
        json={"query": "What is in my lecture notes?"},
    )

    assert response.status_code == 200
    assert response.json() == []
    assert rag_service.retrieve_args is not None
    assert rag_service.retrieve_args["user_id"] == USER_ID
    assert rag_service.retrieve_args["allowed_course_ids"] == frozenset()


def test_course_document_upload_uses_authorized_course_scope(
    authenticated_document_api,
) -> None:
    client, rag_service, session = authenticated_document_api
    session.course_ids = ["course-1"]

    response = client.post(
        "/api/v1/documents",
        data={"course_id": "course-1"},
        files={"file": ("lecture.pdf", b"%PDF-1.4 document", "application/pdf")},
    )

    assert response.status_code == 201
    assert rag_service.ingest_args is not None
    assert rag_service.ingest_args["course_id"] == "course-1"


def test_course_document_upload_rejects_an_unenrolled_course(
    authenticated_document_api,
) -> None:
    client, rag_service, _session = authenticated_document_api

    response = client.post(
        "/api/v1/documents",
        data={"course_id": "other-course"},
        files={"file": ("lecture.pdf", b"%PDF-1.4 document", "application/pdf")},
    )

    assert response.status_code == 404
    assert rag_service.ingest_args is None


def test_delete_is_scoped_to_the_authenticated_user(
    authenticated_document_api,
) -> None:
    client, _rag_service, session = authenticated_document_api

    response = client.delete(f"/api/v1/documents/{DOCUMENT_ID}")

    assert response.status_code == 404
    assert session.statement is not None
    sql = str(session.statement.compile(compile_kwargs={"literal_binds": True}))
    assert f"owner_id = '{USER_ID}'" in sql
    assert DOCUMENT_ID.hex in sql


def test_document_upload_rejects_missing_authentication() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/documents",
            files={"file": ("lecture.pdf", b"%PDF-1.4 document", "application/pdf")},
        )

    assert response.status_code == 401


def test_upload_enforces_streamed_size_limit(authenticated_document_api, monkeypatch) -> None:
    import app.api.documents as document_routes

    client, rag_service, _session = authenticated_document_api
    monkeypatch.setattr(document_routes, "MAX_DOCUMENT_BYTES", 3)

    response = client.post(
        "/api/v1/documents",
        files={"file": ("lecture.txt", b"four", "text/plain")},
    )

    assert response.status_code == 413
    assert rag_service.ingest_args is None


def test_upload_maps_extractor_validation_to_client_error(
    authenticated_document_api,
) -> None:
    client, rag_service, _session = authenticated_document_api
    rag_service.ingest_error = ValueError("Unsupported document type")

    response = client.post(
        "/api/v1/documents",
        files={"file": ("lecture.exe", b"executable", "application/octet-stream")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Unsupported document type"
