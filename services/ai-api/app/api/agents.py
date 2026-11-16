from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID, uuid4

from ai.agents.schemas import (
    AgentPrincipal,
    AgentRunResponse,
    AgentStreamEvent,
)
from ai.agents.service import AgentService, connect_agent_service, make_agent_request
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.core.database import AsyncSessionLocal

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentRequestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: UUID
    request_id: UUID = Field(default_factory=uuid4)
    message: str = Field(min_length=1, max_length=4096)


class ConversationHistoryResponse(BaseModel):
    conversation_id: UUID
    messages: list[dict[str, str]]
    events: list[AgentStreamEvent]


async def get_agent_principal(request: Request) -> AgentPrincipal:
    principal = getattr(request.state, "agent_principal", None)
    if not isinstance(principal, AgentPrincipal):
        raise HTTPException(
            status_code=401,
            detail="Authenticated university identity is required",
        )
    return principal


async def get_agent_service(request: Request) -> AgentService:
    service = getattr(request.app.state, "agent_service", None)
    if service is not None:
        return service
    lock: asyncio.Lock = request.app.state.agent_service_lock
    async with lock:
        service = getattr(request.app.state, "agent_service", None)
        if service is None:
            service = await connect_agent_service(
                settings.sqlalchemy_database_url,
                AsyncSessionLocal,
            )
            request.app.state.agent_service = service
    return service


@router.post("", response_model=AgentRunResponse)
async def run_agent(
    body: AgentRequestBody,
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentRunResponse:
    return await service.invoke(
        make_agent_request(
            principal,
            conversation_id=body.conversation_id,
            request_id=body.request_id,
            message=body.message,
        )
    )


@router.post("/stream")
async def stream_agent(
    body: AgentRequestBody,
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    service: Annotated[AgentService, Depends(get_agent_service)],
) -> StreamingResponse:
    run_request = make_agent_request(
        principal,
        conversation_id=body.conversation_id,
        request_id=body.request_id,
        message=body.message,
    )

    async def stream_events() -> AsyncIterator[str]:
        async for event in service.stream(run_request):
            payload = json.dumps(event.model_dump(mode="json"), ensure_ascii=False)
            yield f"event: {event.event_type}\ndata: {payload}\n\n"

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get(
    "/conversations/{conversation_id}/history",
    response_model=ConversationHistoryResponse,
)
async def get_conversation_history(
    conversation_id: UUID,
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    service: Annotated[AgentService, Depends(get_agent_service)],
) -> ConversationHistoryResponse:
    messages, events = await service.history(principal.user_id, conversation_id)
    return ConversationHistoryResponse(
        conversation_id=conversation_id,
        messages=messages,
        events=events,
    )
