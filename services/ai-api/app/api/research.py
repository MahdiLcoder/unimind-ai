from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Annotated
from uuid import UUID, uuid4

import httpx
from ai.agents.research import AcademicPaper, CrossrefSearch
from ai.agents.schemas import AgentPrincipal
from ai.agents.service import AgentService, make_agent_request
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.agents import get_agent_principal
from app.api.auth import get_current_user
from app.api.dependencies import get_agent_service
from app.core.database import get_db_session
from app.core.platform import platform_flag_enabled
from app.models.academic import ResearchPaper, ResearchSearchHistory
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
    summary: str | None
    year: int | None
    authors: list[str]
    doi: str | None
    url: str | None
    created_at: datetime


class ResearchSearchHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    query: str
    result_count: int
    created_at: datetime


class ResearchCompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paper_ids: list[UUID] = Field(min_length=2, max_length=3)

    @field_validator("paper_ids")
    @classmethod
    def require_distinct_papers(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("paper_ids must be distinct")
        return value


class ResearchCompareResponse(BaseModel):
    comparison: str


class ResearchPaperSummaryResponse(BaseModel):
    summary: str


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
    session.add(
        ResearchSearchHistory(
            owner_id=user.clerk_user_id,
            query=body.query,
            result_count=len(saved),
        )
    )
    await session.commit()
    for paper in saved:
        await session.refresh(paper)
    return [ResearchPaperResponse.model_validate(paper) for paper in saved]


@router.get(
    "/search-history",
    response_model=list[ResearchSearchHistoryResponse],
)
async def list_research_search_history(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[ResearchSearchHistoryResponse]:
    history = await session.scalars(
        select(ResearchSearchHistory)
        .where(ResearchSearchHistory.owner_id == user.clerk_user_id)
        .order_by(ResearchSearchHistory.created_at.desc(), ResearchSearchHistory.id)
        .limit(limit)
    )
    return [
        ResearchSearchHistoryResponse.model_validate(entry)
        for entry in history
    ]


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


@router.post("/compare", response_model=ResearchCompareResponse)
async def compare_saved_research_papers(
    body: ResearchCompareRequest,
    user: Annotated[User, Depends(get_current_user)],
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    service: Annotated[AgentService, Depends(get_agent_service)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ResearchCompareResponse:
    saved_papers = list(
        await session.scalars(
            select(ResearchPaper).where(
                ResearchPaper.owner_id == user.clerk_user_id,
                ResearchPaper.id.in_(body.paper_ids),
            )
        )
    )
    if len(saved_papers) != len(body.paper_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more saved papers were not found",
        )
    paper_by_id = {paper.id: paper for paper in saved_papers}
    papers = [paper_by_id[paper_id] for paper_id in body.paper_ids]

    evidence = []
    for index, paper in enumerate(papers, start=1):
        authors = ", ".join(paper.authors[:4])[:120] or "Not listed"
        abstract = (paper.abstract or "No abstract was saved.")[:400]
        evidence.append(
            f"Paper {index}: {paper.title[:300]}\n"
            f"Authors: {authors}; year: {paper.year or 'unknown'}; "
            f"DOI: {paper.doi or 'not listed'}\n"
            f"Abstract: {abstract}"
        )
    request = make_agent_request(
        principal,
        conversation_id=uuid4(),
        request_id=uuid4(),
        message=(
            "Compare the following saved academic papers using only the supplied "
            "metadata and abstracts. Summarize each paper's focus, compare shared "
            "themes and differences, and state what cannot be concluded from the "
            "available abstracts. Do not invent findings.\n\n"
            + "\n\n".join(evidence)
        ),
    )
    response = await service.invoke(request)
    return ResearchCompareResponse(comparison=response.response)


@router.post(
    "/papers/{paper_id}/summary",
    response_model=ResearchPaperSummaryResponse,
)
async def summarize_saved_research_paper(
    paper_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    service: Annotated[AgentService, Depends(get_agent_service)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ResearchPaperSummaryResponse:
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
    if paper.summary:
        return ResearchPaperSummaryResponse(summary=paper.summary)

    abstract = (paper.abstract or "").strip()
    request = make_agent_request(
        principal,
        conversation_id=uuid4(),
        request_id=uuid4(),
        message=(
            "Summarize this saved academic paper using only the supplied "
            "bibliographic metadata and abstract. State the research focus, "
            "approach, reported contribution, and limitations that can be "
            "supported by the abstract. Explicitly say when information is "
            "unavailable; do not infer unreported results or claim full-text "
            "access.\n\n"
            f"Title: {paper.title[:512]}\n"
            f"Authors: {', '.join(paper.authors[:10]) or 'Not listed'}\n"
            f"Year: {paper.year or 'Not listed'}\n"
            f"DOI: {paper.doi or 'Not listed'}\n"
            f"Abstract: {abstract[:8000] or 'No abstract is available.'}"
        ),
    )
    generated = await service.invoke(request)
    summary = generated.response.strip()
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The research agent returned an empty paper summary",
        )
    paper.summary = summary[:12000]
    await session.commit()
    return ResearchPaperSummaryResponse(summary=paper.summary)


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
