from __future__ import annotations

from collections.abc import Mapping
from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

from ai.agents.schemas import AgentName, Intent, UserRole


def merge_agent_outputs(
    current: dict[str, dict[str, object]],
    update: Mapping[str, dict[str, object]],
) -> dict[str, dict[str, object]]:
    return {**current, **update}


class AgentState(TypedDict, total=False):
    user_id: str
    conversation_id: str
    request_id: str
    user_message: str
    user_role: UserRole
    allowed_course_ids: list[str]
    conversation_history: Annotated[list[AnyMessage], add_messages]
    detected_intent: Intent
    execution_plan: list[str]
    execution_batches: list[list[AgentName]]
    batch_index: int
    selected_agents: list[AgentName]
    agents_to_run: list[AgentName]
    current_agent: AgentName
    retry_requested: bool
    stage_complete: bool
    agent_outputs: Annotated[dict[str, dict[str, object]], merge_agent_outputs]
    retrieved_documents: Annotated[list[dict[str, object]], operator_add]
    sources: Annotated[list[dict[str, object]], operator_add]
    errors: Annotated[list[dict[str, str]], operator_add]
    events: Annotated[list[dict[str, object]], operator_add]
    retry_count: int
    agent_retry_counts: dict[str, int]
    requires_human_approval: bool
    human_approval_status: str | None
    sensitive_action_request: dict[str, object] | None
    sensitive_action_result: dict[str, object] | None
    final_response: str


def operator_add(
    current: list[dict[str, object]],
    update: list[dict[str, object]],
) -> list[dict[str, object]]:
    return [*current, *update]
