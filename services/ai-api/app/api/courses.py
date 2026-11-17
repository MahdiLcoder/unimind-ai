from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user, require_roles
from app.core.database import get_db_session
from app.core.platform import add_audit_log, platform_flag_enabled
from app.models.academic import (
    AcademicTask,
    AssignmentSubmission,
    Course,
    Enrollment,
    Quiz,
    QuizAttempt,
    QuizQuestion,
    TaskProgress,
    Workspace,
    WorkspaceMember,
)
from app.models.users import User, UserRole

router = APIRouter(tags=["academic courses"])
Professor = Annotated[
    User,
    Depends(require_roles(UserRole.PROFESSOR, UserRole.ADMINISTRATOR)),
]
Student = Annotated[User, Depends(require_roles(UserRole.STUDENT))]


async def require_course_access(
    course_id: str,
    user: User,
    session: AsyncSession,
) -> Course:
    course = await session.get(Course, course_id)
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course was not found",
        )
    if user.role == UserRole.ADMINISTRATOR.value:
        return course
    if user.role == UserRole.PROFESSOR.value:
        allowed = course.professor_id == user.clerk_user_id
    else:
        enrollment = await session.get(
            Enrollment,
            {"course_id": course_id, "student_id": user.clerk_user_id},
        )
        allowed = enrollment is not None and enrollment.status == "active"
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course was not found",
        )
    return course


async def get_accessible_course_ids(
    user: User,
    session: AsyncSession,
) -> frozenset[str]:
    query = select(Course.id)
    if user.role == UserRole.STUDENT.value:
        query = query.join(Enrollment, Enrollment.course_id == Course.id).where(
            Enrollment.student_id == user.clerk_user_id,
            Enrollment.status == "active",
        )
    elif user.role == UserRole.PROFESSOR.value:
        query = query.where(Course.professor_id == user.clerk_user_id)
    return frozenset(await session.scalars(query))


class WorkspaceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_by: str
    created_at: datetime


class CourseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: UUID
    code: str
    name: str
    description: str | None
    professor_id: str
    created_at: datetime


class EnrollmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    course_id: str
    student_id: str
    status: str
    enrolled_at: datetime


class CourseEnrollmentProgressResponse(EnrollmentResponse):
    email: str | None
    completed_tasks_count: int
    average_quiz_score: float | None


class CourseLearningOverview(BaseModel):
    course_id: str
    active_students: int
    assignments: int
    assignment_completions: int
    quiz_attempts: int
    average_quiz_score_percent: float | None
    pending_submissions_count: int


@router.post(
    "/workspaces",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_workspace(
    body: WorkspaceCreate,
    professor: Professor,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> WorkspaceResponse:
    workspace = Workspace(name=body.name, created_by=professor.clerk_user_id)
    session.add(workspace)
    await session.flush()
    session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            clerk_user_id=professor.clerk_user_id,
            role="owner",
        )
    )
    await session.commit()
    await session.refresh(workspace)
    return WorkspaceResponse.model_validate(workspace)


@router.get("/workspaces", response_model=list[WorkspaceResponse])
async def list_workspaces(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[WorkspaceResponse]:
    result = await session.scalars(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.clerk_user_id == user.clerk_user_id)
        .order_by(Workspace.created_at.desc(), Workspace.id)
    )
    return [WorkspaceResponse.model_validate(workspace) for workspace in result]


@router.post(
    "/workspaces/{workspace_id}/courses",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_course(
    workspace_id: UUID,
    body: CourseCreate,
    professor: Professor,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CourseResponse:
    membership = await session.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.clerk_user_id == professor.clerk_user_id,
            WorkspaceMember.role == "owner",
        )
    )
    if membership is None and professor.role != UserRole.ADMINISTRATOR.value:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace was not found",
        )
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace was not found",
        )
    course = Course(
        workspace_id=workspace_id,
        code=body.code.strip().upper(),
        name=body.name.strip(),
        description=body.description,
        professor_id=(
            workspace.created_by
            if professor.role == UserRole.ADMINISTRATOR.value
            else professor.clerk_user_id
        ),
    )
    session.add(course)
    await session.commit()
    await session.refresh(course)
    return CourseResponse.model_validate(course)


@router.get("/courses", response_model=list[CourseResponse])
async def list_courses(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[CourseResponse]:
    query = select(Course).order_by(Course.created_at.desc(), Course.id)
    if user.role == UserRole.STUDENT.value:
        query = query.join(Enrollment, Enrollment.course_id == Course.id).where(
            Enrollment.student_id == user.clerk_user_id,
            Enrollment.status == "active",
        )
    elif user.role == UserRole.PROFESSOR.value:
        query = query.where(Course.professor_id == user.clerk_user_id)
    result = await session.scalars(query)
    return [CourseResponse.model_validate(course) for course in result]


@router.get("/courses/catalog", response_model=list[CourseResponse])
async def search_course_catalog(
    _user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    query: Annotated[str, Query(min_length=2, max_length=80)],
) -> list[CourseResponse]:
    result = await session.scalars(
        select(Course)
        .where(
            Course.code.ilike(f"%{query.strip()}%")
            | Course.name.ilike(f"%{query.strip()}%")
        )
        .order_by(Course.code, Course.id)
        .limit(50)
    )
    return [CourseResponse.model_validate(course) for course in result]


@router.post(
    "/courses/{course_id}/enrollment",
    response_model=EnrollmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def enroll_in_course(
    course_id: str,
    student: Student,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EnrollmentResponse:
    if not await platform_flag_enabled(session, "course_self_enrollment_enabled"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student self-enrollment is disabled",
        )
    course = await session.get(Course, course_id)
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course was not found",
        )
    enrollment = await session.get(
        Enrollment,
        {"course_id": course_id, "student_id": student.clerk_user_id},
    )
    if enrollment is not None and enrollment.status == "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already enrolled in this course",
        )
    if enrollment is None:
        enrollment = Enrollment(
            course_id=course_id,
            student_id=student.clerk_user_id,
            status="active",
        )
        session.add(enrollment)
        membership = await session.get(
            WorkspaceMember,
            {
                "workspace_id": course.workspace_id,
                "clerk_user_id": student.clerk_user_id,
            },
        )
        if membership is None:
            session.add(
                WorkspaceMember(
                    workspace_id=course.workspace_id,
                    clerk_user_id=student.clerk_user_id,
                    role="member",
                )
            )
    else:
        enrollment.status = "active"
    add_audit_log(
        session,
        actor_id=student.clerk_user_id,
        action="course_enrolled",
        resource_type="course",
        resource_id=course_id,
        details={},
    )
    await session.commit()
    await session.refresh(enrollment)
    return EnrollmentResponse.model_validate(enrollment)


@router.delete(
    "/courses/{course_id}/enrollment",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def drop_course(
    course_id: str,
    student: Student,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    enrollment = await session.get(
        Enrollment,
        {"course_id": course_id, "student_id": student.clerk_user_id},
    )
    if enrollment is None or enrollment.status != "active":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enrollment was not found",
        )
    enrollment.status = "dropped"
    add_audit_log(
        session,
        actor_id=student.clerk_user_id,
        action="course_dropped",
        resource_type="course",
        resource_id=course_id,
        details={},
    )
    await session.commit()


@router.get(
    "/courses/{course_id}/enrollments",
    response_model=list[CourseEnrollmentProgressResponse],
)
async def list_course_enrollments(
    course_id: str,
    professor: Annotated[
        User, Depends(require_roles(UserRole.PROFESSOR, UserRole.ADMINISTRATOR))
    ],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[CourseEnrollmentProgressResponse]:
    course = await session.get(Course, course_id)
    if course is None or (
        professor.role != UserRole.ADMINISTRATOR.value
        and course.professor_id != professor.clerk_user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course was not found",
        )
    completed_tasks_count = (
        select(func.count(TaskProgress.task_id))
        .join(AcademicTask, AcademicTask.id == TaskProgress.task_id)
        .where(
            TaskProgress.student_id == Enrollment.student_id,
            TaskProgress.status == "completed",
            AcademicTask.course_id == course_id,
            AcademicTask.owner_id.is_(None),
        )
        .correlate(Enrollment)
        .scalar_subquery()
    )
    average_quiz_score = (
        select(
            func.avg(
                QuizAttempt.score
                * 100.0
                / func.nullif(
                    select(func.sum(QuizQuestion.points))
                    .where(QuizQuestion.quiz_id == QuizAttempt.quiz_id)
                    .scalar_subquery(),
                    0,
                )
            )
        )
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .where(
            QuizAttempt.user_id == Enrollment.student_id,
            Quiz.course_id == course_id,
        )
        .correlate(Enrollment)
        .scalar_subquery()
    )
    rows = await session.execute(
        select(
            Enrollment,
            User.email,
            completed_tasks_count.label("completed_tasks_count"),
            average_quiz_score.label("average_quiz_score"),
        )
        .join(User, User.clerk_user_id == Enrollment.student_id)
        .where(Enrollment.course_id == course_id, Enrollment.status == "active")
        .order_by(Enrollment.enrolled_at, Enrollment.student_id)
    )
    return [
        CourseEnrollmentProgressResponse(
            course_id=enrollment.course_id,
            student_id=enrollment.student_id,
            email=email,
            status=enrollment.status,
            enrolled_at=enrollment.enrolled_at,
            completed_tasks_count=completed_count or 0,
            average_quiz_score=(
                float(average_score) if average_score is not None else None
            ),
        )
        for enrollment, email, completed_count, average_score in rows
    ]


@router.get(
    "/courses/{course_id}/learning-overview",
    response_model=CourseLearningOverview,
)
async def course_learning_overview(
    course_id: str,
    professor: Annotated[
        User, Depends(require_roles(UserRole.PROFESSOR, UserRole.ADMINISTRATOR))
    ],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CourseLearningOverview:
    course = await session.get(Course, course_id)
    if course is None or (
        professor.role != UserRole.ADMINISTRATOR.value
        and course.professor_id != professor.clerk_user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course was not found",
        )
    active_students = await session.scalar(
        select(func.count(Enrollment.student_id)).where(
            Enrollment.course_id == course_id,
            Enrollment.status == "active",
        )
    )
    assignments = await session.scalar(
        select(func.count(AcademicTask.id)).where(
            AcademicTask.course_id == course_id,
            AcademicTask.owner_id.is_(None),
        )
    )
    assignment_completions = await session.scalar(
        select(func.count(TaskProgress.task_id))
        .join(AcademicTask, AcademicTask.id == TaskProgress.task_id)
        .where(
            AcademicTask.course_id == course_id,
            AcademicTask.owner_id.is_(None),
            TaskProgress.status == "completed",
        )
    )
    pending_submissions_count = await session.scalar(
        select(func.count(AssignmentSubmission.id))
        .join(AcademicTask, AcademicTask.id == AssignmentSubmission.task_id)
        .where(
            AcademicTask.course_id == course_id,
            AcademicTask.owner_id.is_(None),
            AssignmentSubmission.status == "submitted",
        )
    )
    quiz_attempts, average_score = (
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
            )
            .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
            .where(Quiz.course_id == course_id)
        )
    ).one()
    return CourseLearningOverview(
        course_id=course_id,
        active_students=active_students or 0,
        assignments=assignments or 0,
        assignment_completions=assignment_completions or 0,
        quiz_attempts=quiz_attempts or 0,
        average_quiz_score_percent=(
            float(average_score) if average_score is not None else None
        ),
        pending_submissions_count=pending_submissions_count or 0,
    )
