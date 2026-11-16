import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import agents, health, v1
from app.core.cache import redis_client
from app.core.config import settings
from app.core.database import engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.agent_service = None
    app.state.agent_service_lock = asyncio.Lock()
    try:
        yield
    finally:
        agent_service = app.state.agent_service
        try:
            if agent_service is not None:
                await agent_service.close()
        finally:
            try:
                await redis_client.aclose()
            finally:
                await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    description="Intelligent University Assistant powered by Multi-Agent AI",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(v1.router)
app.include_router(agents.router, prefix="/api/v1")


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "message": "Welcome to UniMind AI API",
        "status": "running",
    }
