from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

import pytest
from ai.agents.planning import PlannedTask, PlanningResponse
from ai.agents.schemas import LearningItem
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.api.courses import get_accessible_course_ids, require_course_access
from app.api.learning import (
    QuestionCreate,
    QuizQuestionResponse,
    StudyPlanCreate,
    StudyPlanGenerationRequest,
    _learning_response_from_agent_output,
    _schedule_study_plan,
    _validated_quiz_questions,
)
from app.core.database import get_db_session
from app.main import app
from app.models.academic import AcademicTask, Course, Enrollment, StudyPlan, TaskProgress
from app.models.users import User


class CoursePermissionSession:
    def __init__(
        self,
        course: Course,
        enrollment: Enrollment | None = None,
    ) -> None:
        self.course = course
        self.enrollment = enrollment
        self.query = None

    async def get(self, model: type, key: object) -> object | None:
        if model is Course:
            return self.course if key == self.course.id else None
        if model is Enrollment:
            return self.enrollment
        raise AssertionError(f"Unexpected model lookup: {model.__name__}")

    async def scalars(self, statement: object) -> list[str]:
        self.query = statement
        return [self.course.id]


class CourseTaskSession(CoursePermissionSession):
    def __init__(self, course: Course) -> None:
        super().__init__(course)
        self.task: AcademicTask | None = None

    def add(self, task: AcademicTask) -> None:
        self.task = task

    async def commit(self) -> None:
        return None

    async def flush(self) -> None:
        if self.task is not None:
            self.task.id = uuid4()

    async def scalars(self, statement: object) -> list[str]:
        self.query = statement
        return []

    async def refresh(self, task: AcademicTask) -> None:
        task.id = uuid4()
        task.status = "pending"
        task.priority = "medium"
        task.created_at = datetime.now(UTC)
        task.updated_at = task.created_at


class ProgressSession:
    def __init__(
        self,
        task: AcademicTask,
        course: Course,
        enrollment: Enrollment,
    ) -> None:
        self.task = task
        self.course = course
        self.enrollment = enrollment
        self.progress_by_student: dict[str, TaskProgress] = {}

    async def get(self, model: type, key: object) -> object | None:
        if model is AcademicTask:
            return self.task if key == self.task.id else None
        if model is Course:
            return self.course if key == self.course.id else None
        if model is Enrollment:
            if isinstance(key, dict) and key.get("student_id") == self.enrollment.student_id:
                return self.enrollment
            return None
        if model is TaskProgress:
            return self.progress_by_student.get(key["student_id"])
        raise AssertionError(f"Unexpected model lookup: {model.__name__}")

    def add(self, progress: TaskProgress) -> None:
        self.progress_by_student[progress.student_id] = progress

    async def commit(self) -> None:
        return None

    async def refresh(self, _item: object) -> None:
        return None


def _course() -> Course:
    return Course(
        id="course-1",
        workspace_id=uuid4(),
        code="CS101",
        name="Computer Science",
        professor_id="professor-1",
    )


def _user(role: str = "student", user_id: str = "student-1") -> User:
    return User(
        clerk_user_id=user_id,
        email=None,
        role=role,
        created_at=datetime.now(UTC),
    )


@pytest.mark.anyio
async def test_course_access_requires_active_student_enrollment() -> None:
    course = _course()
    session = CoursePermissionSession(course)

    with pytest.raises(HTTPException) as error:
        await require_course_access(
            course.id, _user(), cast(AsyncSession, session)
        )

    assert getattr(error.value, "status_code", None) == 404

    session.enrollment = Enrollment(
        course_id=course.id,
        student_id="student-1",
        status="active",
    )
    allowed = await require_course_access(
        course.id, _user(), cast(AsyncSession, session)
    )
    assert allowed is course


@pytest.mark.anyio
async def test_professors_only_receive_their_course_scope() -> None:
    course = _course()
    session = CoursePermissionSession(course)

    course_ids = await get_accessible_course_ids(
        _user("professor", "professor-1"),
        cast(AsyncSession, session),
    )

    assert course_ids == frozenset({"course-1"})
    assert session.query is not None
    sql = str(session.query.compile(compile_kwargs={"literal_binds": True}))
    assert "professor_id = 'professor-1'" in sql


def test_student_cannot_create_a_workspace() -> None:
    app.dependency_overrides[get_current_user] = lambda: _user()
    try:
        with TestClient(app) as client:
            response = client.post("/api/v1/workspaces", json={"name": "Private"})
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403


def test_professor_can_create_a_course_assignment_for_their_course() -> None:
    course = _course()
    session = CourseTaskSession(course)

    async def override_session():
        yield cast(AsyncSession, session)

    app.dependency_overrides[get_current_user] = lambda: _user(
        "professor", "professor-1"
    )
    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/api/v1/courses/{course.id}/tasks",
                json={"title": "Read chapter 2"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 201
    assert response.json()["owner_id"] is None
    assert response.json()["created_by"] == "professor-1"
    assert response.json()["course_id"] == course.id


def test_course_assignment_completion_is_stored_per_student() -> None:
    course = _course()
    task = AcademicTask(
        id=uuid4(),
        owner_id=None,
        created_by="professor-1",
        course_id=course.id,
        title="Read chapter 2",
        status="pending",
        priority="medium",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    enrollment = Enrollment(
        course_id=course.id,
        student_id="student-1",
        status="active",
    )
    session = ProgressSession(task, course, enrollment)

    async def override_session():
        yield cast(AsyncSession, session)

    app.dependency_overrides[get_current_user] = lambda: _user()
    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            response = client.patch(
                f"/api/v1/tasks/{task.id}",
                json={"status": "completed"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert task.status == "pending"
    assert session.progress_by_student["student-1"].status == "completed"


def test_study_plan_rejects_an_invalid_date_range() -> None:
    with pytest.raises(ValidationError):
        StudyPlanCreate(
            title="Midterm review",
            starts_on=datetime.now(UTC).date(),
            ends_on=datetime.now(UTC).date() - timedelta(days=1),
        )


def test_study_plan_creation_serializes_the_persisted_model() -> None:
    now = datetime.now(UTC)

    class StudyPlanSession:
        plan: StudyPlan | None = None

        def add(self, plan: StudyPlan) -> None:
            self.plan = plan

        async def commit(self) -> None:
            return None

        async def refresh(self, plan: StudyPlan) -> None:
            plan.id = uuid4()
            plan.created_at = now
            plan.updated_at = now
            plan.status = "active"

    session = StudyPlanSession()

    async def override_session():
        yield cast(AsyncSession, session)

    app.dependency_overrides[get_current_user] = lambda: _user()
    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/study-plans",
                json={
                    "title": "Midterm review",
                    "summary": "Review lecture notes.",
                    "schedule": [],
                },
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 201
    assert response.json()["title"] == "Midterm review"
    assert response.json()["owner_id"] == "student-1"


def test_study_plan_generation_requires_a_valid_bounded_date_range() -> None:
    with pytest.raises(ValidationError):
        StudyPlanGenerationRequest(
            title="Exam review",
            topic="Biology",
            starts_on=datetime(2026, 1, 1, tzinfo=UTC).date(),
            ends_on=datetime(2027, 1, 2, tzinfo=UTC).date(),
        )


def test_generated_study_plan_obeys_daily_capacity_and_deadlines() -> None:
    plan = PlanningResponse(
        summary="Review biology topics.",
        tasks=[
            PlannedTask(
                title="Cell structure",
                due_date="2026-03-02",
                estimated_hours=1.5,
                priority="high",
                rationale="Prepare before the stated review deadline.",
            ),
            PlannedTask(
                title="Genetics",
                due_date=None,
                estimated_hours=1,
                priority="medium",
                rationale="Continue topic review.",
            ),
        ],
    )

    blocks, unscheduled = _schedule_study_plan(
        plan,
        starts_on=datetime(2026, 3, 1, tzinfo=UTC).date(),
        ends_on=datetime(2026, 3, 3, tzinfo=UTC).date(),
        available_minutes_per_day=60,
        course_id=None,
    )

    load_by_day: dict[str, int] = {}
    for block in blocks:
        day = block.day.isoformat()
        load_by_day[day] = load_by_day.get(day, 0) + block.duration_minutes
        if block.topic == "Cell structure":
            assert block.day <= datetime(2026, 3, 2, tzinfo=UTC).date()
    assert all(minutes <= 60 for minutes in load_by_day.values())
    assert sum(block.duration_minutes for block in blocks) == 150
    assert unscheduled == []


def test_generated_study_plan_reports_work_that_does_not_fit() -> None:
    plan = PlanningResponse(
        summary="Review.",
        tasks=[
            PlannedTask(
                title="Long topic",
                due_date=None,
                estimated_hours=5,
                priority="medium",
                rationale="Requires focused study.",
            )
        ],
    )

    blocks, unscheduled = _schedule_study_plan(
        plan,
        starts_on=datetime(2026, 3, 1, tzinfo=UTC).date(),
        ends_on=datetime(2026, 3, 2, tzinfo=UTC).date(),
        available_minutes_per_day=60,
        course_id=None,
    )

    assert sum(block.duration_minutes for block in blocks) == 120
    assert unscheduled == ["Long topic (180 minutes)"]


def test_multiple_choice_answer_must_be_one_of_the_options() -> None:
    with pytest.raises(ValidationError):
        QuestionCreate(
            prompt="Which option is correct?",
            options=["A", "B"],
            answer_key="C",
        )


def test_public_quiz_question_schema_does_not_expose_answer_key() -> None:
    question = QuizQuestionResponse(
        id=uuid4(),
        position=0,
        prompt="Pick one",
        options=["A", "B"],
        points=1,
    )

    assert "answer_key" not in question.model_dump()


def test_learning_agent_metadata_does_not_invalidate_generated_quiz() -> None:
    response = _learning_response_from_agent_output(
        {
            "mode": "quiz",
            "response": "A practice question.",
            "items": [
                {
                    "kind": "multiple_choice",
                    "prompt": "When is the reading room open on Saturday?",
                    "answer": "10:00 to 14:00",
                    "choices": [
                        "09:00 to 18:00",
                        "10:00 to 14:00",
                        "12:00 to 16:00",
                        "It is closed",
                    ],
                    "explanation": "The provided hours list Saturday as 10:00 to 14:00.",
                }
            ],
            "knowledge_gaps": [],
            "evaluation": None,
            "content": "A practice question.",
            "evidence_sufficient": True,
        }
    )

    assert response.mode == "quiz"
    assert response.items[0].answer == "10:00 to 14:00"


def test_learning_item_requires_a_choices_array() -> None:
    with pytest.raises(ValidationError):
        LearningItem(
            kind="multiple_choice",
            prompt="When is the reading room open on Saturday?",
            answer="10:00 to 14:00",
        )


def test_generated_quiz_rejects_missing_choices() -> None:
    with pytest.raises(ValidationError):
        _learning_response_from_agent_output(
            {
                "mode": "quiz",
                "response": "A question.",
                "items": [
                    {
                        "kind": "multiple_choice",
                        "prompt": "What is 2 + 2?",
                        "answer": "4",
                    }
                ],
                "knowledge_gaps": [],
                "evaluation": None,
            }
        )


def test_generated_quiz_rejects_wrong_item_count() -> None:
    generated = _learning_response_from_agent_output(
        {
            "mode": "quiz",
            "response": "Two questions.",
            "items": [
                {
                    "kind": "multiple_choice",
                    "prompt": "What is 2 + 2?",
                    "answer": "4",
                    "choices": ["1", "2", "3", "4"],
                },
                {
                    "kind": "multiple_choice",
                    "prompt": "What is 3 + 3?",
                    "answer": "6",
                    "choices": ["3", "4", "5", "6"],
                },
            ],
            "knowledge_gaps": [],
            "evaluation": None,
        }
    )

    with pytest.raises(HTTPException) as error:
        _validated_quiz_questions(generated, requested_count=1)

    assert error.value.status_code == 502
    assert error.value.detail == "The learning model did not return the requested quiz"
