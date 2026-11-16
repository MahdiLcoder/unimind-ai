from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.api.courses import get_accessible_course_ids
from app.core.database import get_db_session
from app.models.academic import (
    AcademicTask,
    QuizAttempt,
    QuizQuestion,
    TaskProgress,
)
from app.models.conversations import AgentRun, Conversation
from app.models.users import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardTask(BaseModel):
    id: UUID
    title: str
    due_at: datetime
    status: str
    priority: str
    course_id: str | None


class DashboardAgentRun(BaseModel):
    id: UUID
    title: str
    status: str
    created_at: datetime


class DashboardNotification(BaseModel):
    kind: Literal["deadline", "agent_failure"]
    title: str
    message: str
    created_at: datetime


class DashboardSummary(BaseModel):
    role: str
    course_count: int
    open_task_count: int
    completed_task_count: int
    quiz_attempt_count: int
    average_quiz_score_percent: float | None
    upcoming_tasks: list[DashboardTask]
    recent_agent_runs: list[DashboardAgentRun]
    notifications: list[DashboardNotification]


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> DashboardSummary:
    course_ids = await get_accessible_course_ids(user, session)
    personal_open_tasks = await session.scalar(
        select(func.count(AcademicTask.id)).where(
            AcademicTask.owner_id == user.clerk_user_id,
            AcademicTask.status != "completed",
        )
    )
    personal_completed_tasks = await session.scalar(
        select(func.count(AcademicTask.id)).where(
            AcademicTask.owner_id == user.clerk_user_id,
            AcademicTask.status == "completed",
        )
    )
    course_task_count = await session.scalar(
        select(func.count(AcademicTask.id)).where(
            AcademicTask.owner_id.is_(None),
            AcademicTask.course_id.in_(course_ids),
        )
    )
    completed_course_tasks = await session.scalar(
        select(func.count(TaskProgress.task_id))
        .join(AcademicTask, AcademicTask.id == TaskProgress.task_id)
        .where(
            TaskProgress.student_id == user.clerk_user_id,
            TaskProgress.status == "completed",
            AcademicTask.owner_id.is_(None),
            AcademicTask.course_id.in_(course_ids),
        )
    )
    completed_course_task_count = completed_course_tasks or 0
    open_task_count = (
        (personal_open_tasks or 0)
        + max(0, (course_task_count or 0) - completed_course_task_count)
    )
    completed_task_count = (
        (personal_completed_tasks or 0) + completed_course_task_count
    )
    now = datetime.now(UTC)
    progress_join = (
        (TaskProgress.task_id == AcademicTask.id)
        & (TaskProgress.student_id == user.clerk_user_id)
    )
    open_task_filter = (
        (AcademicTask.owner_id == user.clerk_user_id)
        & (AcademicTask.status != "completed")
    ) | (
        AcademicTask.owner_id.is_(None)
        & AcademicTask.course_id.in_(course_ids)
        & (TaskProgress.status.is_(None) | (TaskProgress.status != "completed"))
    )
    upcoming_rows = await session.scalars(
        select(AcademicTask)
        .outerjoin(TaskProgress, progress_join)
        .where(
            open_task_filter,
            AcademicTask.due_at.is_not(None),
            AcademicTask.due_at >= now,
            AcademicTask.due_at <= now + timedelta(days=7),
        )
        .order_by(AcademicTask.due_at, AcademicTask.id)
        .limit(5)
    )
    upcoming_tasks = [
        DashboardTask(
            id=task.id,
            title=task.title,
            due_at=task.due_at,
            status=task.status,
            priority=task.priority,
            course_id=task.course_id,
        )
        for task in upcoming_rows
        if task.due_at is not None
    ]
    quiz_stats = (
        await session.execute(
            select(
                func.count(QuizAttempt.id),
                func.avg(
                    QuizAttempt.score
                    * 100.0
                    / func.nullif(
                        select(func.sum(QuizQuestion.points))
                        .where(QuizQuestion.quiz_id == QuizAttempt.quiz_id)
                        .scalar_subquery(),
                        0,
                    )
                ),
            ).where(QuizAttempt.user_id == user.clerk_user_id)
        )
    ).one()
    run_rows = (
        await session.execute(
            select(
                AgentRun.id,
                AgentRun.status,
                AgentRun.created_at,
                Conversation.title,
            )
            .join(Conversation, Conversation.id == AgentRun.conversation_id)
            .where(AgentRun.user_id == user.clerk_user_id)
            .order_by(AgentRun.created_at.desc(), AgentRun.id)
            .limit(5)
        )
    ).all()
    recent_runs = [
        DashboardAgentRun(
            id=row.id,
            title=row.title,
            status=row.status,
            created_at=row.created_at,
        )
        for row in run_rows
    ]
    overdue_rows = await session.scalars(
        select(AcademicTask)
        .outerjoin(TaskProgress, progress_join)
        .where(
            open_task_filter,
            AcademicTask.due_at.is_not(None),
            AcademicTask.due_at < now,
            AcademicTask.due_at >= now - timedelta(days=7),
        )
        .order_by(AcademicTask.due_at.desc(), AcademicTask.id)
        .limit(5)
    )
    notifications = [
        DashboardNotification(
            kind="deadline",
            title="Upcoming deadline",
            message=task.title,
            created_at=task.due_at,
        )
        for task in upcoming_rows
        if task.due_at is not None
    ]
    notifications.extend(
        DashboardNotification(
            kind="deadline",
            title="Overdue task",
            message=task.title,
            created_at=task.due_at,
        )
        for task in overdue_rows
        if task.due_at is not None
    )
    notifications.extend(
        DashboardNotification(
            kind="agent_failure",
            title="Agent run needs attention",
            message=run.title,
            created_at=run.created_at,
        )
        for run in recent_runs
        if run.status == "failed"
    )
    return DashboardSummary(
        role=user.role,
        course_count=len(course_ids),
        open_task_count=open_task_count or 0,
        completed_task_count=completed_task_count or 0,
        quiz_attempt_count=quiz_stats[0] or 0,
        average_quiz_score_percent=(
            float(quiz_stats[1]) if quiz_stats[1] is not None else None
        ),
        upcoming_tasks=upcoming_tasks,
        recent_agent_runs=recent_runs,
        notifications=notifications[:10],
    )
