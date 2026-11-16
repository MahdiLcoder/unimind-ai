from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID, uuid4

from ai.agents.schemas import (
    AgentPrincipal,
    AgentRunResponse,
    AgentStreamEvent,
)
from ai.agents.schemas import (
    UserRole as AgentUserRole,
)
from ai.agents.service import AgentService, make_agent_request
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.api.courses import get_accessible_course_ids
from app.api.dependencies import get_agent_service
from app.core.database import get_db_session
from app.models.conversations import AgentRun, AgentStep, Conversation, Message
from app.models.users import User, UserRole

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


class ConversationResponse(BaseModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


async def _start_persisted_run(
    session: AsyncSession,
    principal: AgentPrincipal,
    body: AgentRequestBody,
) -> AgentRun:
    conversation = await session.scalar(
        select(Conversation).where(
            Conversation.id == body.conversation_id,
            Conversation.owner_id == principal.user_id,
        )
    )
    if conversation is None:
        existing = await session.get(Conversation, body.conversation_id)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation was not found",
            )
        conversation = Conversation(
            id=body.conversation_id,
            owner_id=principal.user_id,
            title=body.message.strip()[:200],
        )
        session.add(conversation)

    existing_run = await session.scalar(
        select(AgentRun).where(AgentRun.request_id == body.request_id)
    )
    if existing_run is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Request ID has already been used",
        )

    run = AgentRun(
        request_id=body.request_id,
        conversation_id=body.conversation_id,
        user_id=principal.user_id,
        status="running",
    )
    session.add_all(
        [
            Message(
                conversation_id=body.conversation_id,
                role="user",
                content=body.message,
            ),
            run,
        ]
    )
    await session.commit()
    await session.refresh(run)
    return run


async def _mark_run_failed(
    session: AsyncSession,
    run_id: UUID,
    error_message: str = "Agent execution failed",
) -> None:
    await session.rollback()
    run = await session.get(AgentRun, run_id)
    if run is None:
        return
    run.status = "failed"
    run.error_message = error_message
    run.finished_at = datetime.now(UTC)
    await session.commit()


async def get_agent_principal(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AgentPrincipal:
    role_map = {
        UserRole.STUDENT.value: AgentUserRole.STUDENT,
        UserRole.PROFESSOR.value: AgentUserRole.FACULTY,
        UserRole.ADMINISTRATOR.value: AgentUserRole.ADMIN,
    }
    allowed_course_ids = await get_accessible_course_ids(user, session)
    return AgentPrincipal(
        user_id=user.clerk_user_id,
        role=role_map[user.role],
        allowed_course_ids=allowed_course_ids,
    )


@router.post("", response_model=AgentRunResponse)
async def run_agent(
    body: AgentRequestBody,
    service: Annotated[AgentService, Depends(get_agent_service)],
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AgentRunResponse:
    run = await _start_persisted_run(session, principal, body)
    run_request = make_agent_request(
        principal,
        conversation_id=body.conversation_id,
        request_id=body.request_id,
        message=body.message,
    )
    try:
        response = await service.invoke(run_request)
    except Exception:
        await _mark_run_failed(session, run.id)
        raise
    session.add(
        Message(
            conversation_id=body.conversation_id,
            role="assistant",
            content=response.response,
            sources=response.sources,
        )
    )
    run.status = "completed"
    run.finished_at = datetime.now(UTC)
    run.error_message = None
    session.add(
        AgentStep(
            run_id=run.id,
            event_type="response_ready",
            message="Assistant response ready",
            metadata_json={"sources": response.sources},
            created_at=run.finished_at,
        )
    )
    conversation = await session.get(Conversation, body.conversation_id)
    if conversation is not None:
        conversation.updated_at = run.finished_at
    await session.commit()
    return response


@router.post("/stream")
async def stream_agent(
    body: AgentRequestBody,
    service: Annotated[AgentService, Depends(get_agent_service)],
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StreamingResponse:
    run = await _start_persisted_run(session, principal, body)
    run_request = make_agent_request(
        principal,
        conversation_id=body.conversation_id,
        request_id=body.request_id,
        message=body.message,
    )

    async def stream_events() -> AsyncIterator[str]:
        completed = False
        try:
            async for event in service.stream(run_request):
                session.add(
                    AgentStep(
                        run_id=run.id,
                        event_type=event.event_type,
                        agent_name=event.agent.value if event.agent else None,
                        message=event.message,
                        metadata_json=event.metadata,
                        created_at=event.occurred_at,
                    )
                )
                if event.event_type == "response_ready":
                    session.add(
                        Message(
                            conversation_id=body.conversation_id,
                            role="assistant",
                            content=event.message,
                            sources=event.metadata.get("sources", []),
                        )
                    )
                    run.status = "completed"
                    run.finished_at = datetime.now(UTC)
                    run.error_message = None
                    conversation = await session.get(
                        Conversation, body.conversation_id
                    )
                    if conversation is not None:
                        conversation.updated_at = run.finished_at
                    completed = True
                await session.commit()
                payload = json.dumps(event.model_dump(mode="json"), ensure_ascii=False)
                yield f"event: {event.event_type}\ndata: {payload}\n\n"
        except Exception:
            await _mark_run_failed(session, run.id)
            raise
        finally:
            if not completed:
                await _mark_run_failed(session, run.id, "Agent stream ended before completion")

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ConversationResponse]:
    conversations = await session.scalars(
        select(Conversation)
        .where(Conversation.owner_id == principal.user_id)
        .order_by(Conversation.updated_at.desc(), Conversation.id)
    )
    return [
        ConversationResponse(
            id=conversation.id,
            title=conversation.title,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
        )
        for conversation in conversations
    ]


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_conversation(
    conversation_id: UUID,
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    conversation = await session.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.owner_id == principal.user_id,
        )
    )
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation was not found",
        )
    await session.delete(conversation)
    await session.commit()


@router.get(
    "/conversations/{conversation_id}/history",
    response_model=ConversationHistoryResponse,
)
async def get_conversation_history(
    conversation_id: UUID,
    service: Annotated[AgentService, Depends(get_agent_service)],
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ConversationHistoryResponse:
    conversation = await session.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.owner_id == principal.user_id,
        )
    )
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation was not found",
        )
    stored_messages = await session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
    )
    _checkpoint_messages, events = await service.history(
        principal.user_id, conversation_id
    )
    messages = [
        {"role": message.role, "content": message.content}
        for message in stored_messages
    ]
    return ConversationHistoryResponse(
        conversation_id=conversation_id,
        messages=messages,
        events=events,
    )
