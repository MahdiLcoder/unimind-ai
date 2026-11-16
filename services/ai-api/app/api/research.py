from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Annotated
from uuid import UUID

import httpx
from ai.agents.research import AcademicPaper, CrossrefSearch
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.database import get_db_session
from app.core.platform import platform_flag_enabled
from app.models.academic import ResearchPaper
from app.models.users import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/research", tags=["research"])


class ResearchSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=2, max_length=300)
    limit: int = Field(default=5, ge=1, le=10)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("query must contain at least two non-space characters")
        return normalized


class ResearchPaperResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    external_id: str | None
    title: str
    abstract: str | None
    year: int | None
    authors: list[str]
    doi: str | None
    url: str | None
    created_at: datetime


def get_crossref_search() -> CrossrefSearch:
    return CrossrefSearch(mailto=os.getenv("CROSSREF_MAILTO"))


@router.post(
    "/search",
    response_model=list[ResearchPaperResponse],
    status_code=status.HTTP_200_OK,
)
async def search_research_papers(
    body: ResearchSearchRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    search: Annotated[CrossrefSearch, Depends(get_crossref_search)],
) -> list[ResearchPaperResponse]:
    if not await platform_flag_enabled(session, "research_search_enabled"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Research search is disabled by the administrator",
        )
    try:
        papers = await search.search(body.query, limit=body.limit)
    except (httpx.HTTPError, TypeError, ValueError):
        logger.exception("Crossref research search failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Academic paper search is temporarily unavailable",
        ) from None

    saved = [
        await _save_paper(session, user.clerk_user_id, paper)
        for paper in papers
    ]
    await session.commit()
    for paper in saved:
        await session.refresh(paper)
    return [ResearchPaperResponse.model_validate(paper) for paper in saved]


@router.get("/papers", response_model=list[ResearchPaperResponse])
async def list_research_papers(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[ResearchPaperResponse]:
    papers = await session.scalars(
        select(ResearchPaper)
        .where(ResearchPaper.owner_id == user.clerk_user_id)
        .order_by(ResearchPaper.created_at.desc(), ResearchPaper.id)
        .limit(limit)
    )
    return [ResearchPaperResponse.model_validate(paper) for paper in papers]


@router.delete(
    "/papers/{paper_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_research_paper(
    paper_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    paper = await session.scalar(
        select(ResearchPaper).where(
            ResearchPaper.id == paper_id,
            ResearchPaper.owner_id == user.clerk_user_id,
        )
    )
    if paper is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research paper was not found",
        )
    await session.delete(paper)
    await session.commit()


async def _save_paper(
    session: AsyncSession,
    owner_id: str,
    paper: AcademicPaper,
) -> ResearchPaper:
    match = (
        select(ResearchPaper).where(
            ResearchPaper.owner_id == owner_id,
            ResearchPaper.doi == paper.doi,
        )
        if paper.doi
        else select(ResearchPaper).where(
            ResearchPaper.owner_id == owner_id,
            ResearchPaper.title == paper.title,
        )
    )
    saved = await session.scalar(match)
    if saved is None:
        saved = ResearchPaper(owner_id=owner_id)
        session.add(saved)
    saved.external_id = paper.doi
    saved.title = paper.title
    saved.abstract = paper.abstract or None
    saved.year = paper.year
    saved.authors = list(paper.authors)
    saved.doi = paper.doi
    saved.url = paper.url
    return saved
