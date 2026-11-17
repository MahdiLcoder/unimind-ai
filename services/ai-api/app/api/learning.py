from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID, uuid4

from ai.agents.planning import PlannedTask, PlanningResponse
from ai.agents.schemas import AgentPrincipal, LearningResponse
from ai.agents.service import AgentService, make_agent_request
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.agents import get_agent_principal
from app.api.auth import get_current_user, require_roles
from app.api.courses import get_accessible_course_ids, require_course_access
from app.api.dependencies import get_agent_service
from app.core.database import get_db_session
from app.core.platform import add_audit_log
from app.models.academic import (
    AcademicTask,
    Enrollment,
    Quiz,
    QuizAttempt,
    QuizQuestion,
    StudyPlan,
    TaskProgress,
)
from app.models.platform import UserNotification
from app.models.users import User, UserRole

router = APIRouter(tags=["learning and planning"])
TaskStatus = Literal["pending", "in_progress", "completed"]
TaskPriority = Literal["low", "medium", "high"]
PlanStatus = Literal["active", "completed", "archived"]


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=8000)
    due_at: datetime | None = None
    status: TaskStatus = "pending"
    priority: TaskPriority = "medium"
    course_id: str | None = Field(default=None, min_length=1, max_length=36)


class CourseTaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=8000)
    due_at: datetime | None = None
    priority: TaskPriority = "medium"


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=8000)
    due_at: datetime | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: str | None
    created_by: str
    course_id: str | None
    title: str
    description: str | None
    due_at: datetime | None
    status: TaskStatus
    priority: TaskPriority
    created_at: datetime
    updated_at: datetime


class StudyBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day: date
    topic: str = Field(min_length=1, max_length=200)
    duration_minutes: int = Field(ge=5, le=600)
    course_id: str | None = Field(default=None, min_length=1, max_length=36)
    priority: str | None = Field(default=None, max_length=32)
    rationale: str | None = Field(default=None, max_length=1000)


class StudyPlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=8000)
    starts_on: date | None = None
    ends_on: date | None = None
    schedule: list[StudyBlock] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_date_range(self) -> StudyPlanCreate:
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("ends_on must not be earlier than starts_on")
        for block in self.schedule:
            if self.starts_on and block.day < self.starts_on:
                raise ValueError("study block is before starts_on")
            if self.ends_on and block.day > self.ends_on:
                raise ValueError("study block is after ends_on")
        return self


class StudyPlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=8000)
    starts_on: date | None = None
    ends_on: date | None = None
    status: PlanStatus | None = None
    schedule: list[StudyBlock] | None = Field(default=None, max_length=200)


class StudyPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: str
    title: str
    summary: str | None
    starts_on: date | None
    ends_on: date | None
    schedule: list[StudyBlock]
    status: PlanStatus
    created_at: datetime
    updated_at: datetime


class StudyPlanGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=3, max_length=2000)
    starts_on: date
    ends_on: date
    available_minutes_per_day: int = Field(default=120, ge=15, le=600)
    course_id: str | None = Field(default=None, min_length=1, max_length=36)
    planning_context: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_date_range(self) -> StudyPlanGenerationRequest:
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on must not be earlier than starts_on")
        if (self.ends_on - self.starts_on).days > 365:
            raise ValueError("study plan date range must not exceed one year")
        return self


class QuestionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=4000)
    options: list[str] = Field(default_factory=list, max_length=10)
    answer_key: str | None = Field(default=None, max_length=500)
    explanation: str | None = Field(default=None, max_length=4000)
    points: int = Field(default=1, ge=1, le=100)

    @model_validator(mode="after")
    def validate_answer(self) -> QuestionCreate:
        if len(self.options) == 1:
            raise ValueError("provide either no options or at least two options")
        if self.options and self.answer_key not in self.options:
            raise ValueError("answer_key must match one of the provided options")
        return self


class QuizCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    course_id: str | None = Field(default=None, min_length=1, max_length=36)
    published: bool = False
    questions: list[QuestionCreate] = Field(min_length=1, max_length=100)


class QuizGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic: str = Field(min_length=3, max_length=1000)
    question_count: int = Field(default=5, ge=1, le=20)
    course_id: str | None = Field(default=None, min_length=1, max_length=36)
    published: bool = False


class FlashcardGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic: str = Field(min_length=3, max_length=1000)
    card_count: int = Field(default=10, ge=1, le=30)
    course_id: str | None = Field(default=None, min_length=1, max_length=255)


class FlashcardResponse(BaseModel):
    front: str
    back: str
    hint: str


class QuizQuestionResponse(BaseModel):
    id: UUID
    position: int
    prompt: str
    options: list[str]
    points: int


class QuizResponse(BaseModel):
    id: UUID
    creator_id: str
    course_id: str | None
    title: str
    description: str | None
    published: bool
    created_at: datetime
    questions: list[QuizQuestionResponse]


class QuizSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answers: dict[UUID, str] = Field(max_length=100)


class QuestionFeedback(BaseModel):
    question_id: UUID
    correct: bool
    answer: str | None
    explanation: str | None
    earned_points: int
    total_points: int


class QuizAttemptResponse(BaseModel):
    id: UUID
    quiz_id: UUID
    score: int
    total_points: int
    submitted_at: datetime
    feedback: list[QuestionFeedback]


@router.get("/tasks", response_model=list[TaskResponse])
async def list_tasks(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[TaskResponse]:
    course_ids = await get_accessible_course_ids(user, session)
    tasks = await session.execute(
        select(AcademicTask, TaskProgress.status)
        .outerjoin(
            TaskProgress,
            (TaskProgress.task_id == AcademicTask.id)
            & (TaskProgress.student_id == user.clerk_user_id),
        )
        .where(
            or_(
                AcademicTask.owner_id == user.clerk_user_id,
                AcademicTask.owner_id.is_(None)
                & AcademicTask.course_id.in_(course_ids),
            )
        )
        .order_by(AcademicTask.due_at.is_(None), AcademicTask.due_at, AcademicTask.id)
    )
    return [
        TaskResponse.model_validate(task).model_copy(
            update={"status": progress_status or task.status}
        )
        for task, progress_status in tasks
    ]


@router.post(
    "/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    body: TaskCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TaskResponse:
    if body.course_id:
        await require_course_access(body.course_id, user, session)
    task = AcademicTask(
        owner_id=user.clerk_user_id,
        created_by=user.clerk_user_id,
        course_id=body.course_id,
        title=body.title.strip(),
        description=body.description,
        due_at=body.due_at,
        status=body.status,
        priority=body.priority,
    )
    session.add(task)
    if body.due_at is not None:
        add_audit_log(
            session,
            actor_id=user.clerk_user_id,
            action="task_created",
            resource_type="task",
            resource_id=None,
            details={"course_id": body.course_id, "due_at": body.due_at.isoformat()},
        )
    await session.commit()
    await session.refresh(task)
    return TaskResponse.model_validate(task)


@router.post(
    "/courses/{course_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_course_task(
    course_id: str,
    body: CourseTaskCreate,
    professor: Annotated[
        User,
        Depends(require_roles(UserRole.PROFESSOR, UserRole.ADMINISTRATOR)),
    ],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TaskResponse:
    await require_course_access(course_id, professor, session)
    task = AcademicTask(
        owner_id=None,
        created_by=professor.clerk_user_id,
        course_id=course_id,
        title=body.title.strip(),
        description=body.description,
        due_at=body.due_at,
        priority=body.priority,
    )
    session.add(task)
    await session.flush()
    enrollments = await session.scalars(
        select(Enrollment.student_id).where(
            Enrollment.course_id == course_id,
            Enrollment.status == "active",
        )
    )
    for student_id in enrollments:
        session.add(
            UserNotification(
                user_id=student_id,
                kind="course_assignment",
                title="New course assignment",
                message=body.title.strip(),
                resource_type="task",
                resource_id=str(task.id),
            )
        )
    add_audit_log(
        session,
        actor_id=professor.clerk_user_id,
        action="course_assignment_created",
        resource_type="course",
        resource_id=course_id,
        details={"title": body.title.strip()},
    )
    await session.commit()
    await session.refresh(task)
    return TaskResponse.model_validate(task)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    body: TaskUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TaskResponse:
    task = await session.get(AcademicTask, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task was not found",
        )
    changes = body.model_dump(exclude_unset=True)
    if task.owner_id is None:
        if task.course_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task was not found",
            )
        await require_course_access(task.course_id, user, session)
        if user.role == UserRole.STUDENT.value:
            if set(changes) != {"status"}:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Students may only update the completion status of course tasks",
                )
            progress = await session.get(
                TaskProgress,
                {"task_id": task.id, "student_id": user.clerk_user_id},
            )
            if progress is None:
                progress = TaskProgress(
                    task_id=task.id,
                    student_id=user.clerk_user_id,
                    status=changes["status"],
                )
                session.add(progress)
            else:
                progress.status = changes["status"]
            await session.commit()
            await session.refresh(progress)
            return TaskResponse.model_validate(task).model_copy(
                update={"status": progress.status}
            )
        if "status" in changes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Course assignment completion is tracked per student",
            )
    elif task.owner_id != user.clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task was not found",
        )
    for field, value in changes.items():
        setattr(task, field, value)
    await session.commit()
    await session.refresh(task)
    return TaskResponse.model_validate(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    task = await session.get(AcademicTask, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task was not found",
        )
    if task.owner_id is None:
        if task.course_id is None or user.role not in {
            UserRole.PROFESSOR.value,
            UserRole.ADMINISTRATOR.value,
        }:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task was not found",
            )
        await require_course_access(task.course_id, user, session)
    elif task.owner_id != user.clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task was not found",
        )
    await session.delete(task)
    await session.commit()


@router.get("/study-plans", response_model=list[StudyPlanResponse])
async def list_study_plans(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[StudyPlanResponse]:
    plans = await session.scalars(
        select(StudyPlan)
        .where(StudyPlan.owner_id == user.clerk_user_id)
        .order_by(StudyPlan.created_at.desc(), StudyPlan.id)
    )
    return [StudyPlanResponse.model_validate(plan) for plan in plans]


@router.post(
    "/study-plans",
    response_model=StudyPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_study_plan(
    body: StudyPlanCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StudyPlanResponse:
    course_ids = {
        block.course_id for block in body.schedule if block.course_id is not None
    }
    for course_id in course_ids:
        await require_course_access(course_id, user, session)
    plan = StudyPlan(
        owner_id=user.clerk_user_id,
        title=body.title.strip(),
        summary=body.summary,
        starts_on=body.starts_on,
        ends_on=body.ends_on,
        schedule=[block.model_dump(mode="json") for block in body.schedule],
    )
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return StudyPlanResponse.model_validate(plan)


@router.post(
    "/study-plans/generate",
    response_model=StudyPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_study_plan(
    body: StudyPlanGenerationRequest,
    service: Annotated[AgentService, Depends(get_agent_service)],
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StudyPlanResponse:
    if body.course_id and body.course_id not in principal.allowed_course_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course was not found",
        )

    details = [
        f"Topic or goal: {body.topic.strip()}",
        f"Planning period: {body.starts_on.isoformat()} through {body.ends_on.isoformat()}",
        f"Available study time: at most {body.available_minutes_per_day} minutes per day",
    ]
    if body.planning_context:
        details.append(f"User-provided deadlines and constraints: {body.planning_context.strip()}")
    request = make_agent_request(
        principal,
        conversation_id=uuid4(),
        request_id=uuid4(),
        message=(
            "Create a realistic study plan from only the details below. Do not "
            "invent course requirements, assessment dates, or progress. Return "
            "task due_date values only for deadlines explicitly provided by the "
            "user; otherwise leave due_date null. Estimated hours must represent "
            "study effort, not a deadline. Flag missing details or overload.\n\n"
            + "\n".join(details)
        ),
    )
    state = await service.invoke_planning(request)
    raw_plan = state.get("agent_outputs", {}).get("planning", {}).get("plan")
    try:
        generated = PlanningResponse.model_validate(raw_plan)
        schedule, capacity_warnings = _schedule_study_plan(
            generated,
            starts_on=body.starts_on,
            ends_on=body.ends_on,
            available_minutes_per_day=body.available_minutes_per_day,
            course_id=body.course_id,
        )
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The planning model returned an invalid study plan",
        ) from exc

    summary_parts = [generated.summary]
    if generated.overload_warning:
        summary_parts.append(f"Workload warning: {generated.overload_warning}")
    if generated.assumptions:
        summary_parts.append(
            "Assumptions / missing details: " + "; ".join(generated.assumptions)
        )
    if capacity_warnings:
        summary_parts.append(
            "Not scheduled due to the daily capacity limit: "
            + "; ".join(capacity_warnings)
        )
    plan = StudyPlan(
        owner_id=principal.user_id,
        title=body.title.strip(),
        summary="\n\n".join(summary_parts),
        starts_on=body.starts_on,
        ends_on=body.ends_on,
        schedule=[block.model_dump(mode="json") for block in schedule],
    )
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return StudyPlanResponse.model_validate(plan)


@router.patch("/study-plans/{plan_id}", response_model=StudyPlanResponse)
async def update_study_plan(
    plan_id: UUID,
    body: StudyPlanUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StudyPlanResponse:
    plan = await session.scalar(
        select(StudyPlan).where(
            StudyPlan.id == plan_id,
            StudyPlan.owner_id == user.clerk_user_id,
        )
    )
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study plan was not found",
        )
    changes = body.model_dump(exclude_unset=True)
    starts_on = changes.get("starts_on", plan.starts_on)
    ends_on = changes.get("ends_on", plan.ends_on)
    if starts_on and ends_on and ends_on < starts_on:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ends_on must not be earlier than starts_on",
        )
    if body.schedule is not None:
        for block in body.schedule:
            if block.course_id is not None:
                await require_course_access(block.course_id, user, session)
            if starts_on and block.day < starts_on:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="study block is before starts_on",
                )
            if ends_on and block.day > ends_on:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="study block is after ends_on",
                )
    for field, value in changes.items():
        if field == "schedule":
            value = [block.model_dump(mode="json") for block in body.schedule or []]
        setattr(plan, field, value)
    await session.commit()
    await session.refresh(plan)
    return StudyPlanResponse.model_validate(plan)


@router.get("/quizzes", response_model=list[QuizResponse])
async def list_quizzes(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[QuizResponse]:
    accessible_course_ids = await get_accessible_course_ids(user, session)
    query = select(Quiz).where(
        or_(
            Quiz.creator_id == user.clerk_user_id,
            Quiz.published.is_(True)
            & Quiz.course_id.in_(accessible_course_ids),
        )
    )
    quizzes = await session.scalars(query.order_by(Quiz.created_at.desc(), Quiz.id))
    return [
        await _quiz_response(session, quiz)
        for quiz in quizzes
    ]


@router.post(
    "/quizzes",
    response_model=QuizResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_quiz(
    body: QuizCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> QuizResponse:
    if body.course_id:
        await require_course_access(body.course_id, user, session)
    if body.course_id and body.published and user.role == "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course professors can publish a course quiz",
        )
    quiz = Quiz(
        creator_id=user.clerk_user_id,
        course_id=body.course_id,
        title=body.title.strip(),
        description=body.description,
        published=body.published,
    )
    session.add(quiz)
    await session.flush()
    for position, question in enumerate(body.questions):
        session.add(
            QuizQuestion(
                quiz_id=quiz.id,
                position=position,
                prompt=question.prompt,
                options=question.options,
                answer_key=question.answer_key,
                explanation=question.explanation,
                points=question.points,
            )
        )
    if body.published and body.course_id:
        enrollments = await session.scalars(
            select(Enrollment.student_id).where(
                Enrollment.course_id == body.course_id,
                Enrollment.status == "active",
            )
        )
        for student_id in enrollments:
            session.add(
                UserNotification(
                    user_id=student_id,
                    kind="course_quiz",
                    title="New course quiz",
                    message=body.title.strip(),
                    resource_type="quiz",
                    resource_id=str(quiz.id),
                )
            )
        add_audit_log(
            session,
            actor_id=user.clerk_user_id,
            action="course_quiz_published",
            resource_type="quiz",
            resource_id=str(quiz.id),
            details={"course_id": body.course_id, "title": body.title.strip()},
        )
    await session.commit()
    await session.refresh(quiz)
    return await _quiz_response(session, quiz)


@router.post(
    "/quizzes/generate",
    response_model=QuizResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_quiz(
    body: QuizGenerationRequest,
    service: Annotated[AgentService, Depends(get_agent_service)],
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> QuizResponse:
    if body.course_id and body.course_id not in principal.allowed_course_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course was not found",
        )
    if body.course_id and body.published and principal.role.value == "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course professors can publish a course quiz",
        )

    request = make_agent_request(
        principal,
        conversation_id=uuid4(),
        request_id=uuid4(),
        message=(
            f"Question count: {body.question_count}. Create exactly "
            f"{body.question_count} multiple-choice question(s) about: "
            f"{body.topic.strip()}. Return exactly that many entries in the "
            "items array; it contains questions, not answer choices. Set mode "
            "to quiz. Every item must include a concise prompt, a choices array "
            "with exactly four distinct choices, the exact correct choice as "
            "answer, and a concise explanation."
        ),
    )
    state = await service.invoke_learning(request)
    raw_learning = state.get("agent_outputs", {}).get("learning", {})
    try:
        generated = _learning_response_from_agent_output(raw_learning)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The learning model returned an invalid quiz",
        ) from exc
    questions = _validated_quiz_questions(generated, body.question_count)

    quiz = Quiz(
        creator_id=principal.user_id,
        course_id=body.course_id,
        title=f"Practice quiz: {body.topic.strip()[:170]}",
        description=generated.response,
        published=body.published,
    )
    session.add(quiz)
    await session.flush()
    session.add_all(
        [
            QuizQuestion(
                quiz_id=quiz.id,
                position=position,
                prompt=question.prompt,
                options=question.options,
                answer_key=question.answer_key,
                explanation=question.explanation,
                points=question.points,
            )
            for position, question in enumerate(questions)
        ]
    )
    if quiz.published and body.course_id:
        enrollments = await session.scalars(
            select(Enrollment.student_id).where(
                Enrollment.course_id == body.course_id,
                Enrollment.status == "active",
            )
        )
        for student_id in enrollments:
            session.add(
                UserNotification(
                    user_id=student_id,
                    kind="course_quiz",
                    title="New course quiz",
                    message=quiz.title,
                    resource_type="quiz",
                    resource_id=str(quiz.id),
                )
            )
        add_audit_log(
            session,
            actor_id=principal.user_id,
            action="course_quiz_published",
            resource_type="quiz",
            resource_id=str(quiz.id),
            details={"course_id": body.course_id, "title": quiz.title},
        )
    await session.commit()
    await session.refresh(quiz)
    return await _quiz_response(session, quiz)


@router.post(
    "/flashcards/generate",
    response_model=list[FlashcardResponse],
    status_code=status.HTTP_201_CREATED,
)
async def generate_flashcards(
    body: FlashcardGenerationRequest,
    service: Annotated[AgentService, Depends(get_agent_service)],
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
) -> list[FlashcardResponse]:
    if body.course_id and body.course_id not in principal.allowed_course_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course was not found",
        )
    request = make_agent_request(
        principal,
        conversation_id=uuid4(),
        request_id=uuid4(),
        course_id=body.course_id,
        message=(
            f"Create exactly {body.card_count} study flashcards about: "
            f"{body.topic.strip()}. Set mode to flashcard. Return one concise "
            "concept or question in each item prompt, its accurate answer, "
            "and a brief helpful hint in the explanation. Do not return quiz choices."
        ),
    )
    state = await service.invoke_learning(request)
    raw_learning = state.get("agent_outputs", {}).get("learning", {})
    try:
        generated = _learning_response_from_agent_output(raw_learning)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The learning model returned invalid flashcards",
        ) from exc
    if generated.mode.casefold() != "flashcard" or len(generated.items) != body.card_count:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The learning model did not return the requested flashcards",
        )
    return [
        FlashcardResponse(
            front=item.prompt,
            back=item.answer,
            hint=item.explanation,
        )
        for item in generated.items
    ]


def _learning_response_from_agent_output(
    raw_learning: dict[str, object],
) -> LearningResponse:
    response_payload = {
        key: value
        for key, value in raw_learning.items()
        if key not in {"content", "evidence_sufficient"}
    }
    return LearningResponse.model_validate(response_payload)


def _validated_quiz_questions(
    generated: LearningResponse,
    requested_count: int,
) -> list[QuestionCreate]:
    if generated.mode.casefold() != "quiz" or len(generated.items) != requested_count:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The learning model did not return the requested quiz",
        )

    questions: list[QuestionCreate] = []
    for item in generated.items:
        normalized_choices = [choice.strip().casefold() for choice in item.choices]
        if (
            len(item.choices) != 4
            or any(not choice for choice in normalized_choices)
            or len(set(normalized_choices)) != 4
            or item.answer not in item.choices
        ):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The learning model returned an invalid quiz question",
            )
        questions.append(
            QuestionCreate(
                prompt=item.prompt,
                options=item.choices,
                answer_key=item.answer,
                explanation=item.explanation,
            )
        )
    return questions


@router.post(
    "/quizzes/{quiz_id}/attempts",
    response_model=QuizAttemptResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_quiz_attempt(
    quiz_id: UUID,
    body: QuizSubmission,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> QuizAttemptResponse:
    quiz = await session.get(Quiz, quiz_id)
    if quiz is None or (
        quiz.creator_id != user.clerk_user_id and not quiz.published
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz was not found",
        )
    if quiz.course_id is not None:
        await require_course_access(quiz.course_id, user, session)
    questions = list(
        await session.scalars(
            select(QuizQuestion)
            .where(QuizQuestion.quiz_id == quiz.id)
            .order_by(QuizQuestion.position)
        )
    )
    question_ids = {question.id for question in questions}
    if not set(body.answers).issubset(question_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Answers contain a question that does not belong to this quiz",
        )
    feedback: list[QuestionFeedback] = []
    score = 0
    for question in questions:
        answer = body.answers.get(question.id, "")
        correct = bool(question.answer_key) and (
            answer.strip().casefold() == question.answer_key.strip().casefold()
        )
        earned = question.points if correct else 0
        score += earned
        feedback.append(
            QuestionFeedback(
                question_id=question.id,
                correct=correct,
                answer=question.answer_key,
                explanation=question.explanation,
                earned_points=earned,
                total_points=question.points,
            )
        )
    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=user.clerk_user_id,
        answers={str(question_id): answer for question_id, answer in body.answers.items()},
        score=score,
    )
    session.add(attempt)
    add_audit_log(
        session,
        actor_id=user.clerk_user_id,
        action="quiz_attempt_submitted",
        resource_type="quiz",
        resource_id=str(quiz.id),
        details={"score": score, "total_points": sum(q.points for q in questions)},
    )
    await session.commit()
    await session.refresh(attempt)
    return QuizAttemptResponse(
        id=attempt.id,
        quiz_id=attempt.quiz_id,
        score=score,
        total_points=sum(question.points for question in questions),
        submitted_at=attempt.submitted_at,
        feedback=feedback,
    )


async def _quiz_response(session: AsyncSession, quiz: Quiz) -> QuizResponse:
    questions = await session.scalars(
        select(QuizQuestion)
        .where(QuizQuestion.quiz_id == quiz.id)
        .order_by(QuizQuestion.position)
    )
    return QuizResponse(
        id=quiz.id,
        creator_id=quiz.creator_id,
        course_id=quiz.course_id,
        title=quiz.title,
        description=quiz.description,
        published=quiz.published,
        created_at=quiz.created_at,
        questions=[
            QuizQuestionResponse(
                id=question.id,
                position=question.position,
                prompt=question.prompt,
                options=question.options,
                points=question.points,
            )
            for question in questions
        ],
    )


def _schedule_study_plan(
    plan: PlanningResponse,
    *,
    starts_on: date,
    ends_on: date,
    available_minutes_per_day: int,
    course_id: str | None,
) -> tuple[list[StudyBlock], list[str]]:
    daily_load: dict[date, int] = {}
    blocks: list[StudyBlock] = []
    unscheduled: list[str] = []
    tasks_with_deadlines: list[tuple[date, int, PlannedTask]] = []
    tasks_without_deadlines: list[PlannedTask] = []

    for position, task in enumerate(plan.tasks):
        if task.estimated_hours <= 0:
            unscheduled.append(f"{task.title} (no positive study-time estimate)")
            continue
        deadline = date.fromisoformat(task.due_date) if task.due_date else None
        if deadline is not None:
            if deadline < starts_on:
                raise ValueError("A task deadline precedes the planning period")
            tasks_with_deadlines.append((min(deadline, ends_on), position, task))
        else:
            tasks_without_deadlines.append(task)

    for deadline, _, task in sorted(
        tasks_with_deadlines, key=lambda item: (item[0], item[1])
    ):
        deadline = min(deadline, ends_on)
        days = (deadline - starts_on).days + 1
        remaining_minutes = math.ceil(task.estimated_hours * 60)
        for offset in range(days):
            day = deadline - timedelta(days=offset)
            remaining_minutes = _allocate_study_minutes(
                task,
                day,
                remaining_minutes,
                available_minutes_per_day,
                daily_load,
                blocks,
                course_id,
            )
            if remaining_minutes == 0:
                break
        if remaining_minutes:
            unscheduled.append(f"{task.title} ({remaining_minutes} minutes)")

    for task in tasks_without_deadlines:
        remaining_minutes = math.ceil(task.estimated_hours * 60)
        days = (ends_on - starts_on).days + 1
        for offset in range(days):
            day = starts_on + timedelta(days=offset)
            remaining_minutes = _allocate_study_minutes(
                task,
                day,
                remaining_minutes,
                available_minutes_per_day,
                daily_load,
                blocks,
                course_id,
            )
            if remaining_minutes == 0:
                break
        if remaining_minutes:
            unscheduled.append(f"{task.title} ({remaining_minutes} minutes)")

    blocks.sort(key=lambda block: (block.day, block.topic))
    return blocks, unscheduled


def _allocate_study_minutes(
    task: PlannedTask,
    day: date,
    remaining_minutes: int,
    available_minutes_per_day: int,
    daily_load: dict[date, int],
    blocks: list[StudyBlock],
    course_id: str | None,
) -> int:
    available = available_minutes_per_day - daily_load.get(day, 0)
    if available <= 0 or remaining_minutes <= 0:
        return remaining_minutes
    duration = min(available, remaining_minutes)
    blocks.append(
        StudyBlock(
            day=day,
            topic=task.title,
            duration_minutes=duration,
            course_id=course_id,
            priority=task.priority,
            rationale=task.rationale,
        )
    )
    daily_load[day] = daily_load.get(day, 0) + duration
    if len(blocks) > 200:
        raise ValueError("Generated schedule exceeds the maximum supported size")
    return remaining_minutes - duration
