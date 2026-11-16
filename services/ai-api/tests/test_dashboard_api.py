from datetime import UTC, datetime
from typing import cast

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.database import get_db_session
from app.main import app
from app.models.users import User


class ScalarResults:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def __iter__(self):
        return iter(self.rows)


class QueryResult:
    def one(self) -> tuple[int, float | None]:
        return (0, None)

    def all(self) -> list[object]:
        return []


class DashboardSession:
    def __init__(self) -> None:
        self.scalar_queries: list[object] = []
        self.row_queries: list[object] = []
        self.scalars_queries: list[object] = []
        self.scalar_values = iter([2, 1, 3, 1])
        self.scalars_values = iter([["course-1"], [], []])

    async def scalar(self, statement: object) -> int:
        self.scalar_queries.append(statement)
        return next(self.scalar_values)

    async def scalars(self, statement: object) -> ScalarResults:
        self.scalars_queries.append(statement)
        return ScalarResults(next(self.scalars_values))

    async def execute(self, statement: object) -> QueryResult:
        self.row_queries.append(statement)
        return QueryResult()


def test_dashboard_summary_returns_live_metrics_and_course_scoped_deadlines() -> None:
    user = User(
        clerk_user_id="student-1",
        email=None,
        role="student",
        created_at=datetime.now(UTC),
    )
    session = DashboardSession()

    async def override_session():
        yield cast(AsyncSession, session)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/dashboard/summary")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 200
    summary = response.json()
    assert summary["role"] == "student"
    assert summary["course_count"] == 1
    assert summary["open_task_count"] == 4
    assert summary["completed_task_count"] == 2
    assert summary["quiz_attempt_count"] == 0
    assert summary["average_quiz_score_percent"] is None
    assert summary["upcoming_tasks"] == []
    assert summary["recent_agent_runs"] == []
    course_query = str(session.scalars_queries[0].compile(compile_kwargs={"literal_binds": True}))
    assert "student_id = 'student-1'" in course_query
    task_query = str(session.scalars_queries[1].compile(compile_kwargs={"literal_binds": True}))
    assert "'course-1'" in task_query
    assert "owner_id IS NULL" in task_query
