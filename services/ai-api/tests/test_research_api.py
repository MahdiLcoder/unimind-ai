from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import httpx
from ai.agents.research import AcademicPaper
from ai.agents.schemas import AgentPrincipal
from ai.agents.schemas import UserRole as AgentUserRole
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.agents import get_agent_principal
from app.api.auth import get_current_user
from app.api.dependencies import get_agent_service
from app.api.research import get_crossref_search
from app.core.database import get_db_session
from app.main import app
from app.models.academic import ResearchPaper, ResearchSearchHistory
from app.models.users import User


class ResearchSession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.papers: list[ResearchPaper] = []
        self.statement = None

    async def scalar(self, statement: object) -> None:
        self.statement = statement
        return None

    def add(self, item: object) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        return None

    async def refresh(self, paper: ResearchPaper) -> None:
        paper.id = paper.id or uuid4()
        paper.created_at = datetime.now(UTC)

    async def scalars(self, statement: object) -> list[object]:
        self.statement = statement
        return self.papers


class FakeComparisonService:
    def __init__(self) -> None:
        self.request = None

    async def invoke(self, request: object) -> object:
        self.request = request

        class Response:
            response = "The saved papers share a topic and differ in their method."

        return Response()


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
    saved_papers = [item for item in session.added if isinstance(item, ResearchPaper)]
    search_history = [item for item in session.added if isinstance(item, ResearchSearchHistory)]
    assert len(saved_papers) == 1
    assert saved_papers[0].owner_id == "student-1"
    assert saved_papers[0].doi == "10.1000/example"
    assert len(search_history) == 1
    assert search_history[0].query == "knowledge retrieval"
    assert search_history[0].result_count == 1


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


def test_search_history_is_scoped_to_the_authenticated_user() -> None:
    session = ResearchSession()
    try:
        with _client(session, FakeResearchSearch()) as client:
            response = client.get("/api/v1/research/search-history")
    finally:
        _clear_overrides()

    assert response.status_code == 200
    assert response.json() == []
    assert session.statement is not None
    statement = str(session.statement.compile(compile_kwargs={"literal_binds": True}))
    assert "owner_id = 'student-1'" in statement


def test_compare_rejects_papers_not_saved_by_the_current_user() -> None:
    session = ResearchSession()

    async def override_session():
        yield cast(AsyncSession, session)

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_agent_principal] = lambda: AgentPrincipal(
        user_id="student-1",
        role=AgentUserRole.STUDENT,
    )
    app.dependency_overrides[get_agent_service] = lambda: None
    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/research/compare",
                json={"paper_ids": [str(uuid4()), str(uuid4())]},
            )
    finally:
        _clear_overrides()
        app.dependency_overrides.pop(get_agent_principal, None)
        app.dependency_overrides.pop(get_agent_service, None)

    assert response.status_code == 404
    assert session.statement is not None
    statement = str(session.statement.compile(compile_kwargs={"literal_binds": True}))
    assert "owner_id = 'student-1'" in statement


def test_compare_uses_only_saved_paper_metadata_and_abstracts() -> None:
    first_paper = ResearchPaper(
        id=uuid4(),
        owner_id="student-1",
        title="First saved paper",
        authors=["A. Author"],
        abstract="Evidence from the first study.",
        year=2024,
        doi="10.1000/first",
        created_at=datetime.now(UTC),
    )
    second_paper = ResearchPaper(
        id=uuid4(),
        owner_id="student-1",
        title="Second saved paper",
        authors=["B. Author"],
        abstract="Evidence from the second study.",
        year=2025,
        doi="10.1000/second",
        created_at=datetime.now(UTC),
    )
    session = ResearchSession()
    session.papers = [second_paper, first_paper]
    comparison_service = FakeComparisonService()

    async def override_session():
        yield cast(AsyncSession, session)

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_agent_principal] = lambda: AgentPrincipal(
        user_id="student-1",
        role=AgentUserRole.STUDENT,
    )
    app.dependency_overrides[get_agent_service] = lambda: comparison_service
    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/research/compare",
                json={"paper_ids": [str(first_paper.id), str(second_paper.id)]},
            )
    finally:
        _clear_overrides()
        app.dependency_overrides.pop(get_agent_principal, None)
        app.dependency_overrides.pop(get_agent_service, None)

    assert response.status_code == 200
    assert response.json()["comparison"] == (
        "The saved papers share a topic and differ in their method."
    )
    assert comparison_service.request is not None
    message = comparison_service.request.message
    assert message.index("First saved paper") < message.index("Second saved paper")
    assert "Evidence from the first study." in message
