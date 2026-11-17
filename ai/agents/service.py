from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sys
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from typing import Protocol
from uuid import UUID

from langchain_ollama import ChatOllama
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ai.agents.coding import CodingAgent
from ai.agents.knowledge import KnowledgeAgent
from ai.agents.learning import LearningAgent
from ai.agents.planning import PlanningAgent
from ai.agents.research import CrossrefSearch, ResearchAgent
from ai.agents.schemas import (
    AgentName,
    AgentPrincipal,
    AgentRunRequest,
    AgentRunResponse,
    AgentStreamEvent,
)
from ai.agents.university_services import UniversityServicesAgent
from ai.graphs.agent_workflows import AgentGraphs, create_agent_graphs
from ai.models.config import RAGModelSettings
from ai.models.langchain import LangChainOllamaGenerator
from ai.rag.embeddings import SentenceTransformerEmbedder
from ai.rag.reranking import BGEReranker
from ai.rag.service import RAGService
from ai.state.agent import AgentState

logger = logging.getLogger(__name__)


class AgentEventStore(Protocol):
    async def append(self, event: AgentStreamEvent, user_id: str) -> None: ...

    async def list_for_conversation(
        self,
        user_id: str,
        conversation_id: UUID,
    ) -> list[AgentStreamEvent]: ...


class AgentService:
    def __init__(
        self,
        graphs: AgentGraphs,
        checkpointer: BaseCheckpointSaver,
        event_store: AgentEventStore,
        *,
        checkpoint_context: AbstractAsyncContextManager[AsyncPostgresSaver] | None = None,
        rag_service: RAGService | None = None,
    ) -> None:
        self.graphs = graphs
        self.checkpointer = checkpointer
        self.event_store = event_store
        self._checkpoint_context = checkpoint_context
        self.rag_service = rag_service

    async def invoke(self, request: AgentRunRequest) -> AgentRunResponse:
        config = self._config(request.user_id, request.conversation_id)
        try:
            state = await self.graphs.supervisor.ainvoke(
                self._input(request),
                config=config,
            )
        except Exception:
            logger.exception(
                "Supervisor graph execution failed",
                extra={"request_id": str(request.request_id)},
            )
            raise
        await self._persist_state_events(request, state)
        return self._response(request, state)

    async def invoke_learning(self, request: AgentRunRequest) -> AgentState:
        return await self._invoke_specialist(
            lambda: self.graphs.learning.ainvoke(
                self._input(request),
                config=self._config(request.user_id, request.conversation_id),
            ),
            request,
            "Learning",
        )

    async def invoke_planning(self, request: AgentRunRequest) -> AgentState:
        return await self._invoke_specialist(
            lambda: self.graphs.planning.ainvoke(
                self._input(request),
                config=self._config(request.user_id, request.conversation_id),
            ),
            request,
            "Planning",
        )

    async def _invoke_specialist(
        self,
        invoke: Callable[[], Awaitable[AgentState]],
        request: AgentRunRequest,
        name: str,
    ) -> AgentState:
        try:
            state = await invoke()
        except Exception:
            logger.exception(
                "%s graph execution failed",
                name,
                extra={"request_id": str(request.request_id)},
            )
            raise
        await self._persist_state_events(request, state)
        return state

    async def stream(self, request: AgentRunRequest) -> AsyncIterator[AgentStreamEvent]:
        config = self._config(request.user_id, request.conversation_id)
        try:
            async for part in self.graphs.supervisor.astream(
                self._input(request),
                config=config,
                stream_mode="updates",
                version="v2",
            ):
                if part.get("type") != "updates":
                    continue
                for update in part.get("data", {}).values():
                    if not isinstance(update, dict):
                        continue
                    for raw_event in update.get("events", []):
                        if raw_event.get("request_id") != str(request.request_id):
                            continue
                        event = AgentStreamEvent.model_validate(raw_event)
                        await self.event_store.append(event, request.user_id)
                        yield event
                for update in part.get("data", {}).values():
                    if isinstance(update, dict) and "final_response" in update:
                        return
        except Exception:
            logger.exception(
                "Streaming supervisor graph execution failed",
                extra={"request_id": str(request.request_id)},
            )
            raise

    async def history(
        self,
        user_id: str,
        conversation_id: UUID,
    ) -> tuple[list[dict[str, str]], list[AgentStreamEvent]]:
        config = self._config(user_id, conversation_id)
        snapshot = await self.graphs.supervisor.aget_state(config)
        messages: list[dict[str, str]] = []
        if snapshot.values and snapshot.values.get("user_id") == user_id:
            for message in snapshot.values.get("conversation_history", []):
                role = "assistant" if message.type == "ai" else "user"
                content = message.content
                messages.append(
                    {"role": role, "content": content if isinstance(content, str) else str(content)}
                )
        events = await self.event_store.list_for_conversation(user_id, conversation_id)
        return messages, events

    async def close(self) -> None:
        if self._checkpoint_context is not None:
            await self._checkpoint_context.__aexit__(None, None, None)
            self._checkpoint_context = None

    async def _persist_state_events(
        self,
        request: AgentRunRequest,
        state: AgentState,
    ) -> None:
        for raw_event in state.get("events", []):
            if raw_event.get("request_id") != str(request.request_id):
                continue
            await self.event_store.append(
                AgentStreamEvent.model_validate(raw_event),
                request.user_id,
            )

    @staticmethod
    def _input(request: AgentRunRequest) -> AgentState:
        return {
            "user_id": request.user_id,
            "conversation_id": str(request.conversation_id),
            "request_id": str(request.request_id),
            "user_message": request.message,
            "user_role": request.role,
            "allowed_course_ids": sorted(request.allowed_course_ids),
            "retry_count": 0,
            "agent_retry_counts": {},
        }

    @staticmethod
    def _config(user_id: str, conversation_id: UUID) -> dict[str, object]:
        thread_id = hashlib.sha256(
            f"{user_id}:{conversation_id}".encode()
        ).hexdigest()
        return {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": 50,
        }

    @staticmethod
    def _response(
        request: AgentRunRequest,
        state: AgentState,
    ) -> AgentRunResponse:
        outputs = state.get("agent_outputs", {})
        sources: list[dict[str, object]] = []
        for agent_name in state["selected_agents"]:
            output = outputs.get(agent_name.value, {})
            for key in ("sources", "papers", "documentation"):
                items = output.get(key, [])
                if isinstance(items, list):
                    sources.extend(item for item in items if isinstance(item, dict))
                    if items:
                        break
        return AgentRunResponse(
            conversation_id=request.conversation_id,
            request_id=request.request_id,
            intent=state["detected_intent"],
            selected_agents=tuple(state["selected_agents"]),
            response=state["final_response"],
            sources=sources,
        )


class PostgresAgentEventStore:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self.session_factory = session_factory

    async def append(self, event: AgentStreamEvent, user_id: str) -> None:
        from app.models.agent_events import AgentExecutionEvent

        async with self.session_factory() as session, session.begin():
            session.add(
                AgentExecutionEvent(
                    user_id=user_id,
                    conversation_id=event.conversation_id,
                    request_id=event.request_id,
                    event_type=event.event_type,
                    agent_name=event.agent.value if event.agent else None,
                    message=event.message,
                    metadata_json=event.metadata,
                    created_at=event.occurred_at,
                )
            )

    async def list_for_conversation(
        self,
        user_id: str,
        conversation_id: UUID,
    ) -> list[AgentStreamEvent]:
        from app.models.agent_events import AgentExecutionEvent
        from sqlalchemy import select

        from ai.agents.schemas import AgentName

        async with self.session_factory() as session:
            rows = (
                await session.scalars(
                    select(AgentExecutionEvent)
                    .where(
                        AgentExecutionEvent.user_id == user_id,
                        AgentExecutionEvent.conversation_id == conversation_id,
                    )
                    .order_by(AgentExecutionEvent.created_at, AgentExecutionEvent.id)
                )
            ).all()
        return [
            AgentStreamEvent(
                request_id=row.request_id,
                conversation_id=row.conversation_id,
                event_type=row.event_type,
                message=row.message,
                agent=AgentName(row.agent_name) if row.agent_name else None,
                occurred_at=row.created_at,
                metadata=row.metadata_json,
            )
            for row in rows
        ]


async def connect_agent_service(
    database_url: str,
    session_factory: async_sessionmaker[AsyncSession],
) -> AgentService:
    postgres_url = make_url(database_url).set(drivername="postgresql")
    connection_string = postgres_url.render_as_string(hide_password=False)
    checkpoint_context = AsyncPostgresSaver.from_conn_string(connection_string)
    checkpointer = await checkpoint_context.__aenter__()
    try:
        await checkpointer.setup()
        service = create_default_agent_service(
            checkpointer,
            session_factory=session_factory,
        )
    except Exception:
        await checkpoint_context.__aexit__(*sys.exc_info())
        raise
    service._checkpoint_context = checkpoint_context
    return service


def create_default_agent_service(
    checkpointer: BaseCheckpointSaver,
    *,
    session_factory: async_sessionmaker[AsyncSession],
    event_store: AgentEventStore | None = None,
) -> AgentService:
    settings = RAGModelSettings.from_environment()
    concurrency_limit = asyncio.Semaphore(1)
    model = ChatOllama(
        model=settings.generation.model_id,
        base_url=settings.ollama_base_url,
        temperature=0,
        num_thread=max(1, int(os.getenv("OLLAMA_NUM_THREAD", "4"))),
    )
    generator = LangChainOllamaGenerator(
        model,
        concurrency_limit=concurrency_limit,
    )
    official_email = os.getenv("CROSSREF_MAILTO")
    rag_service = RAGService(
        SentenceTransformerEmbedder(),
        reranker=BGEReranker() if settings.reranker_enabled else None,
        generator=generator,
    )
    graphs = create_agent_graphs(
        KnowledgeAgent(rag_service, session_factory),
        LearningAgent(model, concurrency_limit=concurrency_limit),
        additional_agents={
            AgentName.RESEARCH: ResearchAgent(
                model,
                search=CrossrefSearch(mailto=official_email),
                concurrency_limit=concurrency_limit,
            ),
            AgentName.CODING: CodingAgent(
                model,
                concurrency_limit=concurrency_limit,
            ),
            AgentName.PLANNING: PlanningAgent(
                model,
                concurrency_limit=concurrency_limit,
            ),
            AgentName.UNIVERSITY_SERVICES: UniversityServicesAgent(
                model,
                concurrency_limit=concurrency_limit,
            ),
        },
        checkpointer=checkpointer,
        agent_timeout_seconds=float(os.getenv("AGENT_EXECUTION_TIMEOUT_SECONDS", "45")),
    )
    return AgentService(
        graphs,
        checkpointer,
        event_store or PostgresAgentEventStore(session_factory),
        rag_service=rag_service,
    )


def make_agent_request(
    principal: AgentPrincipal,
    *,
    conversation_id: UUID,
    request_id: UUID,
    message: str,
    course_id: str | None = None,
) -> AgentRunRequest:
    return AgentRunRequest(
        user_id=principal.user_id,
        conversation_id=conversation_id,
        request_id=request_id,
        message=message,
        role=principal.role,
        allowed_course_ids=(
            frozenset({course_id})
            if course_id is not None
            else principal.allowed_course_ids
        ),
    )
