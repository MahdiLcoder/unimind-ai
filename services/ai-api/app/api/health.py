import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.cache import redis_client
from app.core.database import engine

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


class ReadinessResponse(BaseModel):
    status: str
    checks: dict[str, str]


@router.get("/health/live")
async def liveness() -> dict[str, str]:
    return {"status": "alive"}


@router.get("/health")
async def legacy_health() -> dict[str, str]:
    return {"status": "healthy"}


async def check_database() -> str:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return "healthy"
    except SQLAlchemyError:
        logger.exception("Database readiness check failed")
        return "unavailable"


async def check_cache() -> str:
    try:
        await redis_client.ping()
        return "healthy"
    except RedisError:
        logger.exception("Redis readiness check failed")
        return "unavailable"


@router.get("/health/ready", response_model=ReadinessResponse)
async def readiness() -> ReadinessResponse:
    checks = {
        "database": await check_database(),
        "cache": await check_cache(),
    }
    is_ready = all(result == "healthy" for result in checks.values())
    response = ReadinessResponse(
        status="ready" if is_ready else "unavailable",
        checks=checks,
    )
    if not is_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=response.model_dump(),
        )
    return response
