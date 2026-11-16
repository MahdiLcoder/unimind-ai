from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

import pytest
from ai.agents.schemas import (
    AgentName,
    AgentRunRequest,
    AgentStreamEvent,
    Intent,
    UserRole,
)
from ai.agents.service import AgentService
from ai.graphs.agent_workflows import AgentGraphs, create_agent_graphs
from langgraph.checkpoint.memory import InMemorySaver


class _RecordingAgent:
    def __init__(
        self,
        name: AgentName,
        *,
        sufficient: bool = True,
        active_counter: list[int] | None = None,
    ) -> None:
        self.name = name
        self.sufficient = sufficient
        self.active_counter = active_counter
        self.top_k: list[int] = []

    async def execute(self, state: dict[str, object]) -> dict[str, object]:
        if self.active_counter is not None:
            self.active_counter[0] += 1
            self.active_counter[1] = max(
                self.active_counter[0],
                self.active_counter[1],
            )
            await asyncio.sleep(0.02)
            self.active_counter[0] -= 1
        self.top_k.append(5 * (2 ** int(state.get("retry_count", 0))))
        return {
            "agent_outputs": {
                self.name.value: {
                    "content": f"{self.name.value} result",
                    "evidence_sufficient": self.sufficient,
                    "citation_valid": self.sufficient,
                }
            },
            "sources": (
                [{"citation": "[doc:1234]"}]
                if self.name == AgentName.KNOWLEDGE and self.sufficient
                else []
            ),
        }


class _EventStore:
    def __init__(self) -> None:
        self.events: list[tuple[str, AgentStreamEvent]] = []

    async def append(self, event: AgentStreamEvent, user_id: str) -> None:
        self.events.append((user_id, event))

    async def list_for_conversation(
        self,
        user_id: str,
        conversation_id: UUID,
    ) -> list[AgentStreamEvent]:
        return [
            event
            for owner, event in self.events
            if owner == user_id and event.conversation_id == conversation_id
        ]


def _request(message: str, *, conversation_id: UUID | None = None) -> AgentRunRequest:
    return AgentRunRequest(
        user_id="student-1",
        conversation_id=conversation_id or uuid4(),
        request_id=uuid4(),
        message=message,
        role=UserRole.STUDENT,
        allowed_course_ids=frozenset({"course-1"}),
    )


def _graphs(
    checkpointer: InMemorySaver,
    *,
    knowledge: _RecordingAgent | None = None,
    learning: _RecordingAgent | None = None,
) -> AgentGraphs:
    return create_agent_graphs(
        knowledge or _RecordingAgent(AgentName.KNOWLEDGE),
        learning or _RecordingAgent(AgentName.LEARNING),
        checkpointer=checkpointer,
    )


@pytest.mark.asyncio
async def test_supervisor_routes_knowledge_and_learning_requests() -> None:
    checkpointer = InMemorySaver()
    knowledge = _RecordingAgent(AgentName.KNOWLEDGE)
    learning = _RecordingAgent(AgentName.LEARNING)
    graphs = _graphs(checkpointer, knowledge=knowledge, learning=learning)

    knowledge_state = await graphs.supervisor.ainvoke(
        AgentService._input(_request("When does the library open?")),
        config={"configurable": {"thread_id": "knowledge-route"}},
    )
    learning_state = await graphs.supervisor.ainvoke(
        AgentService._input(_request("Create a quiz about photosynthesis.")),
        config={"configurable": {"thread_id": "learning-route"}},
    )

    assert knowledge_state["detected_intent"] == Intent.KNOWLEDGE_QUESTION
    assert knowledge_state["selected_agents"] == [AgentName.KNOWLEDGE]
    assert learning_state["detected_intent"] == Intent.LEARNING_ACTIVITY
    assert learning_state["selected_agents"] == [AgentName.LEARNING]
    assert knowledge.top_k == [5]
    assert learning.top_k == [5]


@pytest.mark.asyncio
async def test_combined_workflow_runs_agents_in_parallel_and_records_execution() -> None:
    active = [0, 0]
    graphs = _graphs(
        InMemorySaver(),
        knowledge=_RecordingAgent(AgentName.KNOWLEDGE, active_counter=active),
        learning=_RecordingAgent(AgentName.LEARNING, active_counter=active),
    )

    state = await graphs.supervisor.ainvoke(
        AgentService._input(
            _request("Create a quiz from the course syllabus about campus safety.")
        ),
        config={"configurable": {"thread_id": "combined-route"}},
    )

    assert state["detected_intent"] == Intent.KNOWLEDGE_AND_LEARNING
    assert set(state["selected_agents"]) == {AgentName.KNOWLEDGE, AgentName.LEARNING}
    assert active[1] == 2
    assert "knowledge result" in state["final_response"]
    assert "learning result" in state["final_response"]
    event_types = [event["event_type"] for event in state["events"]]
    assert event_types[0] == "routing_decision"
    assert event_types.count("agent_completed") == 2
    assert event_types[-1] == "response_ready"


@pytest.mark.asyncio
async def test_insufficient_evidence_retries_once_then_discloses_limitation() -> None:
    knowledge = _RecordingAgent(AgentName.KNOWLEDGE, sufficient=False)
    graphs = _graphs(InMemorySaver(), knowledge=knowledge)

    state = await graphs.supervisor.ainvoke(
        AgentService._input(_request("What is in my university policy?")),
        config={"configurable": {"thread_id": "insufficient-evidence"}},
    )

    assert knowledge.top_k == [5, 10]
    assert state["retry_count"] == 1
    assert "could not verify" in state["final_response"]


@pytest.mark.asyncio
async def test_stream_and_checkpoint_resume_preserve_conversation_history() -> None:
    checkpointer = InMemorySaver()
    graphs = _graphs(checkpointer)
    event_store = _EventStore()
    service = AgentService(graphs, checkpointer, event_store)
    conversation_id = uuid4()
    first_request = _request("What does the handbook say?", conversation_id=conversation_id)

    first_events = [event async for event in service.stream(first_request)]
    second_request = _request(
        "What does the university policy say?",
        conversation_id=conversation_id,
    )
    response = await service.invoke(second_request)
    messages, stored_events = await service.history("student-1", conversation_id)

    assert [event.event_type for event in first_events] == [
        "routing_decision",
        "agent_completed",
        "response_ready",
    ]
    assert response.selected_agents == (AgentName.KNOWLEDGE,)
    assert [message["role"] for message in messages] == [
        "user",
        "assistant",
        "user",
        "assistant",
    ]
    assert len(stored_events) == 6
    assert all(event.conversation_id == conversation_id for event in stored_events)
