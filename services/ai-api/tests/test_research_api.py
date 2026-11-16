from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import httpx
from ai.agents.research import AcademicPaper
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.api.research import get_crossref_search
from app.core.database import get_db_session
from app.main import app
from app.models.academic import ResearchPaper
from app.models.users import User


class ResearchSession:
    def __init__(self) -> None:
        self.added: list[ResearchPaper] = []
        self.statement = None

    async def scalar(self, statement: object) -> None:
        self.statement = statement
        return None

    def add(self, paper: ResearchPaper) -> None:
        self.added.append(paper)

    async def commit(self) -> None:
        return None

    async def refresh(self, paper: ResearchPaper) -> None:
        paper.id = paper.id or uuid4()
        paper.created_at = datetime.now(UTC)


class FakeResearchSearch:
    def __init__(self, papers: list[AcademicPaper] | None = None) -> None:
        self.papers = papers or []

    async def search(self, query: str, *, limit: int = 5) -> list[AcademicPaper]:
        assert query == "knowledge retrieval"
        assert limit == 2
        return self.papers


class FailingResearchSearch:
    async def search(self, query: str, *, limit: int = 5) -> list[AcademicPaper]:
        raise httpx.ConnectError("Crossref unavailable")


def _user() -> User:
    return User(
        clerk_user_id="student-1",
        email=None,
        role="student",
        created_at=datetime.now(UTC),
    )


def _client(session: ResearchSession, search: object) -> TestClient:
    async def override_session():
        yield cast(AsyncSession, session)

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_crossref_search] = lambda: cast(
        object, search
    )
    return TestClient(app)


def _clear_overrides() -> None:
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db_session, None)
    app.dependency_overrides.pop(get_crossref_search, None)


def test_research_search_persists_results_for_the_authenticated_user() -> None:
    session = ResearchSession()
    search = FakeResearchSearch(
        [
            AcademicPaper(
                title="Knowledge retrieval",
                authors=("A. Researcher",),
                year=2025,
                doi="10.1000/example",
                url="https://doi.org/10.1000/example",
                abstract="An abstract.",
            )
        ]
    )
    try:
        with _client(session, search) as client:
            response = client.post(
                "/api/v1/research/search",
                json={"query": " knowledge retrieval ", "limit": 2},
            )
    finally:
        _clear_overrides()

    assert response.status_code == 200
    assert response.json()[0]["title"] == "Knowledge retrieval"
    assert response.json()[0]["year"] == 2025
    assert len(session.added) == 1
    assert session.added[0].owner_id == "student-1"
    assert session.added[0].doi == "10.1000/example"


def test_research_search_reports_upstream_failure() -> None:
    try:
        with _client(ResearchSession(), FailingResearchSearch()) as client:
            response = client.post(
                "/api/v1/research/search",
                json={"query": "knowledge retrieval", "limit": 2},
            )
    finally:
        _clear_overrides()

    assert response.status_code == 502


def test_research_deletion_does_not_find_another_users_paper() -> None:
    session = ResearchSession()
    paper_id = uuid4()
    try:
        with _client(session, FakeResearchSearch()) as client:
            response = client.delete(f"/api/v1/research/papers/{paper_id}")
    finally:
        _clear_overrides()

    assert response.status_code == 404
    assert session.statement is not None
    statement = str(session.statement.compile(compile_kwargs={"literal_binds": True}))
    assert "owner_id = 'student-1'" in statement


def test_research_query_rejects_whitespace_only_input() -> None:
    try:
        with _client(ResearchSession(), FakeResearchSearch()) as client:
            response = client.post(
                "/api/v1/research/search",
                json={"query": "   ", "limit": 2},
            )
    finally:
        _clear_overrides()

    assert response.status_code == 422
