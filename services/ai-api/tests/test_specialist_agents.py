from __future__ import annotations

import asyncio
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from ai.agents.coding import CodingAgent
from ai.agents.planning import PlanningAgent, PlanningResponse
from ai.agents.research import CrossrefSearch, ResearchAgent
from ai.agents.routing import route_request
from ai.agents.schemas import AgentName, AgentRunRequest, UserRole
from ai.agents.service import AgentService
from ai.agents.university_services import UniversityServicesAgent
from ai.graphs.agent_workflows import create_agent_graphs
from langgraph.checkpoint.memory import InMemorySaver


def _state(message: str = "Help me plan my week") -> dict[str, object]:
    return {
        "user_id": "student-1",
        "conversation_id": str(uuid4()),
        "request_id": str(uuid4()),
        "user_message": message,
        "user_role": UserRole.STUDENT,
        "allowed_course_ids": [],
        "retry_count": 0,
    }


class _TextModel:
    def __init__(self, content: str = "Supported answer") -> None:
        self.content = content
        self.prompts: list[str] = []

    async def ainvoke(self, prompt: str) -> SimpleNamespace:
        self.prompts.append(prompt)
        return SimpleNamespace(content=self.content)


class _StructuredChain:
    async def ainvoke(self, prompt: str) -> PlanningResponse:
        assert "Do not invent dates" in prompt
        return PlanningResponse(
            summary="Schedule based on your stated availability.",
            assumptions=["No due dates were supplied."],
        )


class _StructuredModel:
    def with_structured_output(self, _schema: type[PlanningResponse]) -> _StructuredChain:
        return _StructuredChain()


class _GraphAgent:
    def __init__(self, name: AgentName, calls: list[str]) -> None:
        self.name = name
        self.calls = calls

    async def execute(self, _state: dict[str, object]) -> dict[str, object]:
        self.calls.append(self.name.value)
        if self.name == AgentName.RESEARCH:
            await asyncio.sleep(0.01)
        return {
            "agent_outputs": {
                self.name.value: {
                    "content": f"{self.name.value} contribution",
                    "evidence_sufficient": True,
                }
            }
        }


@pytest.mark.asyncio
async def test_crossref_search_parses_real_metadata_and_research_uses_it() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.crossref.org"
        assert request.url.params["rows"] == "5"
        return httpx.Response(
            200,
            json={
                "message": {
                    "items": [
                        {
                            "title": ["Paper title"],
                            "author": [{"given": "Ada", "family": "Lovelace"}],
                            "published": {"date-parts": [[2024, 2, 1]]},
                            "DOI": "10.1234/example",
                            "URL": "https://doi.org/10.1234/example",
                            "abstract": "<jats:p>Evidence from a study.</jats:p>",
                        }
                    ]
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        search = CrossrefSearch(client=client, mailto="research@example.edu")
        model = _TextModel("Summary with a citation.")
        agent = ResearchAgent(model, search=search)
        result = await agent.execute(_state("Compare academic papers about RAG"))

    paper = result["agent_outputs"]["research"]["papers"][0]
    assert paper["title"] == "Paper title"
    assert paper["authors"] == ["Ada Lovelace"]
    assert paper["year"] == 2024
    assert "Evidence from a study." in model.prompts[0]
    assert result["agent_outputs"]["research"]["evidence_sufficient"] is True


@pytest.mark.asyncio
async def test_coding_agent_never_claims_to_run_user_code() -> None:
    model = _TextModel("Here is a safe example.")
    agent = CodingAgent(model)

    result = await agent.execute(_state("Please run this code"))

    assert result["agent_outputs"]["coding"]["execution_available"] is False
    assert "Code execution was not performed" in result["agent_outputs"]["coding"]["content"]
    assert "Do not claim code was run" in model.prompts[0]


@pytest.mark.asyncio
async def test_planning_agent_returns_structured_plan_and_discloses_missing_details() -> None:
    result = await PlanningAgent(_StructuredModel()).execute(
        _state("Create a weekly study schedule")
    )

    output = result["agent_outputs"]["planning"]
    assert output["plan"]["assumptions"] == ["No due dates were supplied."]
    assert "No due dates were supplied." in output["content"]


@pytest.mark.asyncio
async def test_university_services_fails_closed_without_verified_source() -> None:
    model = _TextModel()

    result = await UniversityServicesAgent(model).execute(
        _state("What are the exam regulations?")
    )

    output = result["agent_outputs"]["university_services"]
    assert output["evidence_sufficient"] is False
    assert output["retryable"] is False
    assert "could not verify" in output["content"]
    assert model.prompts == []


@pytest.mark.asyncio
async def test_complex_route_runs_three_agents_with_research_dependency_first() -> None:
    decision = route_request(
        "Research academic papers about neural networks, create a programming "
        "solution, and make a weekly study plan."
    )
    assert decision.execution_batches == (
        (AgentName.RESEARCH,),
        (AgentName.CODING, AgentName.PLANNING),
    )

    calls: list[str] = []
    graphs = create_agent_graphs(
        _GraphAgent(AgentName.KNOWLEDGE, calls),
        _GraphAgent(AgentName.LEARNING, calls),
        additional_agents={
            AgentName.RESEARCH: _GraphAgent(AgentName.RESEARCH, calls),
            AgentName.CODING: _GraphAgent(AgentName.CODING, calls),
            AgentName.PLANNING: _GraphAgent(AgentName.PLANNING, calls),
            AgentName.UNIVERSITY_SERVICES: _GraphAgent(
                AgentName.UNIVERSITY_SERVICES,
                calls,
            ),
        },
        checkpointer=InMemorySaver(),
    )
    request = AgentRunRequest(
        user_id="student-1",
        conversation_id=uuid4(),
        message=(
            "Research academic papers about neural networks, create a programming "
            "solution, and make a weekly study plan."
        ),
        role=UserRole.STUDENT,
    )
    state = await graphs.supervisor.ainvoke(
        AgentService._input(request),
        config={"configurable": {"thread_id": "complex-three-agent"}},
    )

    assert calls[0] == AgentName.RESEARCH.value
    assert set(calls[1:]) == {AgentName.CODING.value, AgentName.PLANNING.value}
    assert set(state["selected_agents"]) == {
        AgentName.RESEARCH,
        AgentName.CODING,
        AgentName.PLANNING,
    }
    assert all(
        f"{agent.value} contribution" in state["final_response"]
        for agent in (AgentName.RESEARCH, AgentName.CODING, AgentName.PLANNING)
    )
    event_types = [event["event_type"] for event in state["events"]]
    assert "agent_batch_ready" in event_types
    assert event_types[-1] == "response_ready"

