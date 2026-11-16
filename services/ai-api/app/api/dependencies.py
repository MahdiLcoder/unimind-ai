import asyncio
from typing import Annotated

from ai.agents.service import AgentService, connect_agent_service
from ai.rag.service import RAGService
from fastapi import Depends, HTTPException, Request, status

from app.core.config import settings
from app.core.database import AsyncSessionLocal


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


async def get_rag_service(
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> RAGService:
    if agent_service.rag_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document processing is unavailable",
        )
    return agent_service.rag_service
