from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from ai.agents.knowledge import KnowledgeAgent
from ai.agents.learning import LearningAgent
from ai.agents.routing import route_request
from ai.agents.schemas import AgentName, Intent, RoutingDecision
from ai.state.agent import AgentState

logger = logging.getLogger(__name__)
_MAX_RETRIES = 1


@dataclass(frozen=True, slots=True)
class AgentGraphs:
    simple_qa: Any
    supervisor: Any
    knowledge_qa: Any
    learning: Any
    combined: Any


def create_agent_graphs(
    knowledge_agent: KnowledgeAgent,
    learning_agent: LearningAgent,
    *,
    checkpointer: BaseCheckpointSaver | None = None,
) -> AgentGraphs:
    agents = {
        AgentName.KNOWLEDGE: knowledge_agent,
        AgentName.LEARNING: learning_agent,
    }

    def record_request(state: AgentState) -> dict[str, object]:
        return {
            "conversation_history": [HumanMessage(content=state["user_message"])],
        }

    def supervisor(state: AgentState) -> dict[str, object]:
        decision = route_request(state["user_message"])
        return _routing_update(state, decision)

    def force_combined(state: AgentState) -> dict[str, object]:
        decision = RoutingDecision(
            intent=Intent.KNOWLEDGE_AND_LEARNING,
            selected_agents=(AgentName.KNOWLEDGE, AgentName.LEARNING),
            plan=(
                "Retrieve relevant permitted university material.",
                "Generate the requested personalized learning activity in parallel.",
                "Combine the grounded evidence and learning material.",
            ),
            parallel=True,
        )
        return _routing_update(state, decision)

    def force_agent(agent_name: AgentName):
        def set_route(state: AgentState) -> dict[str, object]:
            decision = RoutingDecision(
                intent=(
                    Intent.KNOWLEDGE_QUESTION
                    if agent_name == AgentName.KNOWLEDGE
                    else Intent.LEARNING_ACTIVITY
                ),
                selected_agents=(agent_name,),
                plan=(f"Run the {agent_name.value} workflow.",),
                parallel=False,
            )
            return _routing_update(state, decision)

        return set_route

    async def execute_agent(state: AgentState) -> dict[str, object]:
        agent_name = state["current_agent"]
        agent = agents[agent_name]
        try:
            result = await agent.execute(state)
            message = (
                "Retrieved and checked university evidence."
                if agent_name == AgentName.KNOWLEDGE
                else "Generated structured learning material."
            )
            event = _event(state, "agent_completed", message, agent_name)
            return {**result, "events": [event]}
        except Exception as exc:
            logger.exception(
                "Agent execution failed",
                extra={
                    "agent": agent_name.value,
                    "request_id": state["request_id"],
                    "error_type": type(exc).__name__,
                },
            )
            error_code = "agent_execution_failed"
            return {
                "agent_outputs": {
                    agent_name.value: {
                        "content": (
                            "This agent could not complete its task. "
                            "Please try again."
                        ),
                        "evidence_sufficient": False,
                        "error_code": error_code,
                    }
                },
                "errors": [{"agent": agent_name.value, "code": error_code}],
                "events": [
                    _event(
                        state,
                        "agent_failed",
                        "The agent encountered an error.",
                        agent_name,
                        {"error_code": error_code},
                    )
                ],
            }

    def evaluate(state: AgentState) -> dict[str, object]:
        retry_agents: list[AgentName] = []
        outputs = state.get("agent_outputs", {})
        for agent_name in state["selected_agents"]:
            output = outputs.get(agent_name.value, {})
            failed = bool(output.get("error_code"))
            needs_more_evidence = (
                agent_name == AgentName.KNOWLEDGE
                and not output.get("evidence_sufficient", False)
            )
            if failed or needs_more_evidence:
                retry_agents.append(agent_name)

        should_retry = bool(retry_agents) and state.get("retry_count", 0) < _MAX_RETRIES
        if not should_retry:
            return {"retry_requested": False}
        return {
            "retry_count": state.get("retry_count", 0) + 1,
            "agents_to_run": retry_agents,
            "retry_requested": True,
            "events": [
                _event(
                    state,
                    "retry_requested",
                    "Retrying an agent after an error or insufficient evidence.",
                    metadata={"agents": [agent.value for agent in retry_agents]},
                )
            ],
        }

    def finalize(state: AgentState) -> dict[str, object]:
        outputs = state.get("agent_outputs", {})
        sections: list[str] = []
        for agent_name in state["selected_agents"]:
            output = outputs.get(agent_name.value, {})
            content = str(output.get("content", "")).strip()
            if not content:
                continue
            if (
                agent_name == AgentName.KNOWLEDGE
                and not output.get("evidence_sufficient", False)
            ):
                sections.append(
                    "I could not verify an answer from the accessible university "
                    "documents. " + content
                )
            elif agent_name == AgentName.KNOWLEDGE and not output.get(
                "citation_valid", False
            ):
                sections.append(
                    "I could not validate the answer's citations, so I cannot present "
                    "it as a grounded answer."
                )
            else:
                sections.append(content)
        response = (
            "\n\n".join(sections)
            if sections
            else "I could not complete this request. Please try again."
        )
        event = _event(state, "response_ready", response)
        return {
            "final_response": response,
            "conversation_history": [AIMessage(content=response)],
            "events": [event],
        }

    def fan_out(state: AgentState) -> list[Send]:
        return [
            Send(
                "agent_worker",
                {**state, "current_agent": agent_name},
            )
            for agent_name in state["agents_to_run"]
        ]

    def after_evaluation(state: AgentState) -> str:
        return "retry" if state.get("retry_requested", False) else "finish"

    def base_builder() -> StateGraph:
        builder = StateGraph(AgentState)
        builder.add_node("dispatch", lambda _state: {})
        builder.add_node("agent_worker", execute_agent)
        builder.add_node("evaluate", evaluate)
        builder.add_node("finalize", finalize)
        builder.add_conditional_edges("dispatch", fan_out)
        builder.add_edge("agent_worker", "evaluate")
        builder.add_conditional_edges(
            "evaluate",
            after_evaluation,
            {"retry": "dispatch", "finish": "finalize"},
        )
        builder.add_edge("finalize", END)
        return builder

    def single_agent_graph(agent_name: AgentName):
        builder = base_builder()
        builder.add_node("record_request", record_request)
        builder.add_node("select_agent", force_agent(agent_name))
        builder.add_edge(START, "record_request")
        builder.add_edge("record_request", "select_agent")
        builder.add_edge("select_agent", "dispatch")
        return builder.compile(checkpointer=checkpointer)

    supervisor_builder = base_builder()
    supervisor_builder.add_node("record_request", record_request)
    supervisor_builder.add_node("supervisor", supervisor)
    supervisor_builder.add_edge(START, "record_request")
    supervisor_builder.add_edge("record_request", "supervisor")
    supervisor_builder.add_edge("supervisor", "dispatch")

    combined_builder = base_builder()
    combined_builder.add_node("record_request", record_request)
    combined_builder.add_node("select_agents", force_combined)
    combined_builder.add_edge(START, "record_request")
    combined_builder.add_edge("record_request", "select_agents")
    combined_builder.add_edge("select_agents", "dispatch")

    knowledge_graph = single_agent_graph(AgentName.KNOWLEDGE)
    return AgentGraphs(
        simple_qa=knowledge_graph,
        supervisor=supervisor_builder.compile(checkpointer=checkpointer),
        knowledge_qa=knowledge_graph,
        learning=single_agent_graph(AgentName.LEARNING),
        combined=combined_builder.compile(checkpointer=checkpointer),
    )


def _routing_update(
    state: AgentState,
    decision: RoutingDecision,
) -> dict[str, object]:
    return {
        "detected_intent": decision.intent,
        "execution_plan": list(decision.plan),
        "selected_agents": list(decision.selected_agents),
        "agents_to_run": list(decision.selected_agents),
        "events": [
            _event(
                state,
                "routing_decision",
                "Selected the specialized workflow.",
                metadata={
                    "intent": decision.intent.value,
                    "selected_agents": [
                        agent.value for agent in decision.selected_agents
                    ],
                    "plan": list(decision.plan),
                    "parallel": decision.parallel,
                },
            )
        ],
    }


def _event(
    state: AgentState,
    event_type: str,
    message: str,
    agent: AgentName | None = None,
    metadata: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "request_id": state["request_id"],
        "conversation_id": state["conversation_id"],
        "event_type": event_type,
        "message": message,
        "agent": agent.value if agent else None,
        "occurred_at": datetime.now(UTC).isoformat(),
        "metadata": metadata or {},
    }
