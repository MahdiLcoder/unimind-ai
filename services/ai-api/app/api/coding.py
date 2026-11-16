from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.auth import get_current_user
from app.core.config import settings
from app.models.users import User

router = APIRouter(prefix="/coding", tags=["coding"])


class CodeExecutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=8_000)


class CodeExecutionResponse(BaseModel):
    exit_code: int | None
    stdout: str
    stderr: str
    timed_out: bool


@router.post("/execute", response_model=CodeExecutionResponse)
async def execute_code(
    body: CodeExecutionRequest,
    _user: Annotated[User, Depends(get_current_user)],
) -> CodeExecutionResponse:
    if not settings.code_runner_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Code execution is not configured",
        )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{settings.code_runner_url.rstrip('/')}/execute",
                json=body.model_dump(),
            )
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="The isolated execution worker timed out",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The isolated execution worker is unavailable",
        ) from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="The execution worker is busy; retry shortly",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The isolated execution worker rejected the request",
        ) from exc

    return CodeExecutionResponse.model_validate(response.json())
