from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from time import perf_counter
from typing import Any, Protocol

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
_DEFAULT_AGENT_TIMEOUT_SECONDS = 30.0


class AgentExecutor(Protocol):
    async def execute(self, state: AgentState) -> dict[str, object]: ...


@dataclass(frozen=True, slots=True)
class AgentGraphs:
    simple_qa: Any
    supervisor: Any
    knowledge_qa: Any
    learning: Any
    planning: Any
    combined: Any


def create_agent_graphs(
    knowledge_agent: KnowledgeAgent,
    learning_agent: LearningAgent,
    *,
    additional_agents: Mapping[AgentName, AgentExecutor] | None = None,
    checkpointer: BaseCheckpointSaver | None = None,
    agent_timeout_seconds: float = _DEFAULT_AGENT_TIMEOUT_SECONDS,
) -> AgentGraphs:
    if agent_timeout_seconds <= 0:
        raise ValueError("agent_timeout_seconds must be positive")
    agents = {
        AgentName.KNOWLEDGE: knowledge_agent,
        AgentName.LEARNING: learning_agent,
        **(additional_agents or {}),
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
            return _routing_update(
                state,
                RoutingDecision(
                    intent={
                        AgentName.KNOWLEDGE: Intent.KNOWLEDGE_QUESTION,
                        AgentName.LEARNING: Intent.LEARNING_ACTIVITY,
                        AgentName.PLANNING: Intent.PLANNING_TASK,
                    }.get(agent_name, Intent.MULTI_AGENT_TASK),
                    selected_agents=(agent_name,),
                    plan=(f"Run the {agent_name.value} workflow.",),
                    parallel=False,
                ),
            )

        return set_route

    async def execute_agent(state: AgentState) -> dict[str, object]:
        agent_name = state["current_agent"]
        agent = agents.get(agent_name)
        if agent is None:
            raise RuntimeError(f"No implementation is registered for {agent_name.value}")
        started = perf_counter()
        try:
            result = await asyncio.wait_for(
                agent.execute(state),
                timeout=agent_timeout_seconds,
            )
            message = f"Completed the {agent_name.value} task."
            event = _event(
                state,
                "agent_completed",
                message,
                agent_name,
                {
                    "latency_ms": round((perf_counter() - started) * 1000, 2),
                    "retry_count": state.get("retry_count", 0),
                },
            )
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
                        "retryable": True,
                    }
                },
                "errors": [{"agent": agent_name.value, "code": error_code}],
                "events": [
                    _event(
                        state,
                        "agent_failed",
                        "The agent encountered an error.",
                        agent_name,
                        {
                            "error_code": error_code,
                            "latency_ms": round((perf_counter() - started) * 1000, 2),
                        },
                    )
                ],
            }

    def evaluate(state: AgentState) -> dict[str, object]:
        outputs = state.get("agent_outputs", {})
        current_agents = state.get("agents_to_run", [])

        # Check if an agent flagged a sensitive action requiring human approval
        for agent_name in current_agents:
            output = outputs.get(agent_name.value, {})
            if output.get("requires_human_approval"):
                req = output.get("sensitive_action_request") or {
                    "action": f"{agent_name.value}_action",
                    "agent": agent_name.value,
                }
                return {
                    "requires_human_approval": True,
                    "sensitive_action_request": req,
                    "stage_complete": True,
                    "retry_requested": False,
                    "events": [
                        _event(
                            state,
                            "human_approval_requested",
                            f"Action by {agent_name.value} requires human confirmation.",
                            agent_name,
                            metadata=req,
                        )
                    ],
                }

        retry_agents: list[AgentName] = []
        for agent_name in current_agents:
            output = outputs.get(agent_name.value, {})
            failed = not output or bool(output.get("error_code"))
            needs_more_evidence = (
                agent_name in {AgentName.KNOWLEDGE, AgentName.UNIVERSITY_SERVICES}
                and not output.get("evidence_sufficient", False)
                and output.get("retryable", True)
            )
            retry_count = state.get("agent_retry_counts", {}).get(agent_name.value, 0)
            if (failed or needs_more_evidence) and retry_count < _MAX_RETRIES:
                retry_agents.append(agent_name)

        should_retry = bool(retry_agents)
        if should_retry:
            retry_counts = dict(state.get("agent_retry_counts", {}))
            for agent_name in retry_agents:
                retry_counts[agent_name.value] = retry_counts.get(agent_name.value, 0) + 1
            return {
                "retry_count": state.get("retry_count", 0) + 1,
                "agent_retry_counts": retry_counts,
                "agents_to_run": retry_agents,
                "retry_requested": True,
                "stage_complete": False,
                "events": [
                    _event(
                        state,
                        "retry_requested",
                        "Retrying an agent after an error or insufficient evidence.",
                        metadata={"agents": [agent.value for agent in retry_agents]},
                    )
                ],
            }

        batches = state.get("execution_batches", [])
        current_batch = state.get("batch_index", 0)
        if batches and current_batch + 1 < len(batches):
            next_batch = current_batch + 1
            return {
                "agents_to_run": batches[next_batch],
                "batch_index": next_batch,
                "retry_requested": False,
                "stage_complete": False,
                "events": [
                    _event(
                        state,
                        "agent_batch_ready",
                        "Dependencies completed; starting the next agent batch.",
                        metadata={
                            "agents": [agent.value for agent in batches[next_batch]],
                            "batch_index": next_batch,
                        },
                    )
                ],
            }
        return {
            "retry_requested": False,
            "stage_complete": True,
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
        sources: list[dict[str, object]] = []
        for agent_name in state.get("selected_agents", []):
            output = outputs.get(agent_name.value, {})
            for key in ("sources", "papers", "documentation"):
                items = output.get(key, [])
                if isinstance(items, list):
                    sources.extend(item for item in items if isinstance(item, dict))
                    if items:
                        break
        event = _event(state, "response_ready", response, metadata={"sources": sources})
        return {
            "final_response": response,
            "conversation_history": [AIMessage(content=response)],
            "events": [event],
        }

    def fan_out(state: AgentState) -> list[Send]:
        return [
            Send(
                "agent_worker",
                {
                    **state,
                    "current_agent": agent_name,
                    "retry_count": state.get("agent_retry_counts", {}).get(
                        agent_name.value,
                        0,
                    ),
                },
            )
            for agent_name in state["agents_to_run"]
        ]

    def after_evaluation(state: AgentState) -> str:
        if state.get("retry_requested", False):
            return "dispatch"
        return "finish" if state.get("stage_complete", False) else "dispatch"

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
            {"dispatch": "dispatch", "finish": "finalize"},
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
        planning=single_agent_graph(AgentName.PLANNING),
        combined=combined_builder.compile(checkpointer=checkpointer),
    )


def _routing_update(
    state: AgentState,
    decision: RoutingDecision,
) -> dict[str, object]:
    batches = decision.execution_batches or (decision.selected_agents,)
    return {
        "detected_intent": decision.intent,
        "execution_plan": list(decision.plan),
        "selected_agents": list(decision.selected_agents),
        "execution_batches": [list(batch) for batch in batches],
        "batch_index": 0,
        "agents_to_run": list(batches[0]),
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
                    "execution_batches": [
                        [agent.value for agent in batch] for batch in batches
                    ],
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
