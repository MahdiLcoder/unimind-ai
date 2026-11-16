from __future__ import annotations

import asyncio
import html
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

import httpx
from langchain_core.language_models.chat_models import BaseChatModel

from ai.agents._generation import generate_text
from ai.state.agent import AgentState

_TAG = re.compile(r"<[^>]+>")
_MAX_ABSTRACT_LENGTH = 6000


@dataclass(frozen=True, slots=True)
class AcademicPaper:
    title: str
    authors: tuple[str, ...]
    year: int | None
    doi: str | None
    url: str | None
    abstract: str

    def as_source(self) -> dict[str, object]:
        return {
            "title": self.title,
            "authors": list(self.authors),
            "year": self.year,
            "doi": self.doi,
            "url": self.url,
        }


class AcademicSearch(Protocol):
    async def search(self, query: str, *, limit: int = 5) -> list[AcademicPaper]: ...


class CrossrefSearch:
    """Search Crossref bibliographic metadata without storing retrieved records."""

    def __init__(
        self,
        *,
        client: httpx.AsyncClient | None = None,
        mailto: str | None = None,
        timeout: float = 10.0,
    ) -> None:
        self._client = client
        self._mailto = mailto
        self._timeout = timeout

    async def search(self, query: str, *, limit: int = 5) -> list[AcademicPaper]:
        if not query.strip():
            raise ValueError("Academic search query cannot be empty")
        if not 1 <= limit <= 10:
            raise ValueError("Academic search limit must be between 1 and 10")
        headers = {"User-Agent": "UniMindAI/0.1 (academic metadata search)"}
        params: dict[str, str | int] = {
            "query.bibliographic": query,
            "rows": limit,
            "select": "title,author,published,issued,DOI,URL,abstract,type",
        }
        if self._mailto:
            params["mailto"] = self._mailto
        if self._client is not None:
            response = await self._client.get(
                "https://api.crossref.org/works",
                params=params,
                headers=headers,
                timeout=self._timeout,
            )
        else:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(
                    "https://api.crossref.org/works",
                    params=params,
                    headers=headers,
                )
        response.raise_for_status()
        payload = response.json()
        message = payload.get("message", {}) if isinstance(payload, Mapping) else {}
        items = message.get("items", []) if isinstance(message, Mapping) else []
        if not isinstance(items, list):
            raise TypeError("Crossref returned an invalid work list")
        return [paper for item in items if (paper := _parse_paper(item)) is not None]


class ResearchAgent:
    def __init__(
        self,
        model: BaseChatModel,
        *,
        search: AcademicSearch | None = None,
        concurrency_limit: asyncio.Semaphore | None = None,
    ) -> None:
        self.model = model
        self.search = search or CrossrefSearch()
        self.concurrency_limit = concurrency_limit

    async def execute(self, state: AgentState) -> dict[str, object]:
        papers = await self.search.search(state["user_message"], limit=5)
        if not papers:
            content = (
                "Crossref returned no matching academic records. Try a narrower "
                "topic, author, or DOI."
            )
            return {
                "agent_outputs": {
                    "research": {
                        "content": content,
                        "evidence_sufficient": False,
                        "papers": [],
                    }
                },
                "sources": [],
            }

        evidence = [
            {
                **paper.as_source(),
                "abstract": paper.abstract,
            }
            for paper in papers
        ]
        prompt = (
            "You are UniMind AI's academic research assistant. Use only the "
            "Crossref records below for bibliographic facts. Abstracts may be "
            "missing; do not infer their contents. Compare only what the supplied "
            "records support, clearly label limitations and research-gap ideas "
            "as tentative, and never invent findings. Provide an evidence-based "
            "summary, comparison, and concise APA-style bibliography with DOI "
            "links where available. Preserve source titles and author names.\n\n"
            f"User request:\n{state['user_message']}\n\n"
            f"Crossref records (JSON):\n{evidence!r}"
        )
        content = await generate_text(
            self.model,
            prompt,
            concurrency_limit=self.concurrency_limit,
        )
        return {
            "agent_outputs": {
                "research": {
                    "content": content,
                    "evidence_sufficient": True,
                    "papers": [paper.as_source() for paper in papers],
                }
            },
            "sources": [paper.as_source() for paper in papers],
        }


def _parse_paper(raw: object) -> AcademicPaper | None:
    if not isinstance(raw, Mapping):
        return None
    raw_titles = raw.get("title", [])
    title = raw_titles[0].strip() if isinstance(raw_titles, list) and raw_titles else ""
    if not isinstance(title, str) or not title:
        return None
    authors: list[str] = []
    raw_authors = raw.get("author", [])
    if isinstance(raw_authors, list):
        for author in raw_authors:
            if not isinstance(author, Mapping):
                continue
            name = " ".join(
                part.strip()
                for part in (author.get("given"), author.get("family"))
                if isinstance(part, str) and part.strip()
            )
            if name:
                authors.append(name)
    year = _publication_year(raw)
    doi = raw.get("DOI")
    url = raw.get("URL")
    abstract = raw.get("abstract")
    if isinstance(abstract, str):
        abstract = html.unescape(_TAG.sub(" ", abstract))
        abstract = " ".join(abstract.split())[:_MAX_ABSTRACT_LENGTH]
    else:
        abstract = ""
    return AcademicPaper(
        title=title,
        authors=tuple(authors),
        year=year,
        doi=doi if isinstance(doi, str) else None,
        url=url if isinstance(url, str) else None,
        abstract=abstract,
    )


def _publication_year(raw: Mapping[str, object]) -> int | None:
    for key in ("published", "issued"):
        date = raw.get(key)
        parts = date.get("date-parts") if isinstance(date, Mapping) else None
        if (
            isinstance(parts, list)
            and parts
            and isinstance(parts[0], list)
            and parts[0]
            and isinstance(parts[0][0], int)
        ):
            return parts[0][0]
    return None
