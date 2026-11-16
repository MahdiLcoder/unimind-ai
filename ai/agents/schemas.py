from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AgentName(StrEnum):
    KNOWLEDGE = "knowledge"
    LEARNING = "learning"


class UserRole(StrEnum):
    STUDENT = "student"
    FACULTY = "faculty"
    STAFF = "staff"
    ADMIN = "admin"


class Intent(StrEnum):
    KNOWLEDGE_QUESTION = "knowledge_question"
    LEARNING_ACTIVITY = "learning_activity"
    KNOWLEDGE_AND_LEARNING = "knowledge_and_learning"


class AgentPrincipal(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    user_id: str = Field(min_length=1, max_length=255)
    role: UserRole
    allowed_course_ids: frozenset[str] = frozenset()

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("user_id cannot be blank")
        return value

    @field_validator("allowed_course_ids")
    @classmethod
    def validate_course_ids(cls, values: frozenset[str]) -> frozenset[str]:
        if any(not value.strip() or len(value) > 255 for value in values):
            raise ValueError("Course IDs must contain 1 to 255 characters")
        return values


class AgentRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    user_id: str = Field(min_length=1, max_length=255)
    conversation_id: UUID
    request_id: UUID = Field(default_factory=uuid4)
    message: str = Field(min_length=1, max_length=4096)
    role: UserRole
    allowed_course_ids: frozenset[str] = frozenset()

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message cannot be blank")
        return value


class RoutingDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    intent: Intent
    selected_agents: tuple[AgentName, ...] = Field(min_length=1)
    plan: tuple[str, ...] = Field(min_length=1)
    parallel: bool

    @field_validator("selected_agents")
    @classmethod
    def validate_agents(cls, agents: tuple[AgentName, ...]) -> tuple[AgentName, ...]:
        if len(set(agents)) != len(agents):
            raise ValueError("selected_agents cannot contain duplicates")
        return agents


class LearningItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str
    prompt: str
    answer: str
    choices: list[str] = Field(default_factory=list)
    explanation: str = ""


class AnswerEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_answer: str
    expected_answer: str
    feedback: str


class LearningResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: str
    response: str
    items: list[LearningItem] = Field(default_factory=list)
    knowledge_gaps: list[str] = Field(default_factory=list)
    evaluation: AnswerEvaluation | None = None


class AgentRunResponse(BaseModel):
    conversation_id: UUID
    request_id: UUID
    intent: Intent
    selected_agents: tuple[AgentName, ...]
    response: str
    sources: list[dict[str, str | int | None]] = Field(default_factory=list)


class AgentStreamEvent(BaseModel):
    request_id: UUID
    conversation_id: UUID
    event_type: str
    message: str
    agent: AgentName | None = None
    occurred_at: datetime
    metadata: dict[str, object] = Field(default_factory=dict)
