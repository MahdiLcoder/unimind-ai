from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AgentName(StrEnum):
    KNOWLEDGE = "knowledge"
    LEARNING = "learning"
    RESEARCH = "research"
    CODING = "coding"
    PLANNING = "planning"
    UNIVERSITY_SERVICES = "university_services"


class UserRole(StrEnum):
    STUDENT = "student"
    FACULTY = "faculty"
    STAFF = "staff"
    ADMIN = "admin"


class Intent(StrEnum):
    KNOWLEDGE_QUESTION = "knowledge_question"
    LEARNING_ACTIVITY = "learning_activity"
    KNOWLEDGE_AND_LEARNING = "knowledge_and_learning"
    RESEARCH_TASK = "research_task"
    CODING_TASK = "coding_task"
    PLANNING_TASK = "planning_task"
    UNIVERSITY_SERVICES_QUESTION = "university_services_question"
    MULTI_AGENT_TASK = "multi_agent_task"


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


class LearningMemoryData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preferences: dict[str, str] = Field(default_factory=dict, max_length=32)
    progress: dict[str, str] = Field(default_factory=dict, max_length=100)

    @field_validator("preferences", "progress")
    @classmethod
    def validate_memory_entries(cls, values: dict[str, str]) -> dict[str, str]:
        if any(
            not key.strip()
            or len(key) > 128
            or not value.strip()
            or len(value) > 2000
            for key, value in values.items()
        ):
            raise ValueError("Memory keys and values must be non-empty and bounded")
        return values


class RoutingDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    intent: Intent
    selected_agents: tuple[AgentName, ...] = Field(min_length=1)
    plan: tuple[str, ...] = Field(min_length=1)
    parallel: bool
    execution_batches: tuple[tuple[AgentName, ...], ...] = ()

    @field_validator("selected_agents")
    @classmethod
    def validate_agents(cls, agents: tuple[AgentName, ...]) -> tuple[AgentName, ...]:
        if len(set(agents)) != len(agents):
            raise ValueError("selected_agents cannot contain duplicates")
        return agents

    @model_validator(mode="after")
    def validate_execution_batches(self) -> RoutingDecision:
        if not self.execution_batches:
            return self
        flattened = [
            agent for batch in self.execution_batches for agent in batch
        ]
        if (
            any(not batch for batch in self.execution_batches)
            or len(flattened) != len(set(flattened))
            or set(flattened) != set(self.selected_agents)
        ):
            raise ValueError(
                "execution_batches must include every selected agent exactly once"
            )
        return self


class LearningItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str
    prompt: str
    answer: str
    choices: list[str]
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
    sources: list[dict[str, object]] = Field(default_factory=list)


class AgentStreamEvent(BaseModel):
    request_id: UUID
    conversation_id: UUID
    event_type: str
    message: str
    agent: AgentName | None = None
    occurred_at: datetime
    metadata: dict[str, object] = Field(default_factory=dict)
