from __future__ import annotations

import asyncio
from html.parser import HTMLParser
from urllib.parse import urljoin

import httpx
from langchain_core.language_models.chat_models import BaseChatModel

from ai.agents._generation import generate_text
from ai.state.agent import AgentState

_PYTHON_DOCS_SEARCH = "https://docs.python.org/3/search.html"
_EXECUTION_TERMS = ("run this", "execute this", "run the code", "execute the code")


class _SearchResultParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.results: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            self._href = next(
                (value for key, value in attrs if key == "href" and value),
                None,
            )
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href:
            title = " ".join("".join(self._text).split())
            href = urljoin("https://docs.python.org/3/", self._href)
            if title and href.startswith("https://docs.python.org/3/"):
                self.results.append((title, href))
            self._href = None
            self._text = []


class PythonDocumentationSearch:
    def __init__(self, *, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def search(self, query: str) -> list[dict[str, str]]:
        if not query.strip():
            return []
        if self._client is not None:
            response = await self._client.get(
                _PYTHON_DOCS_SEARCH,
                params={"q": query[:200]},
                timeout=8.0,
            )
        else:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(
                    _PYTHON_DOCS_SEARCH,
                    params={"q": query[:200]},
                )
        response.raise_for_status()
        parser = _SearchResultParser()
        parser.feed(response.text)
        return [
            {"title": title, "url": url}
            for title, url in parser.results[:5]
        ]


class CodingAgent:
    def __init__(
        self,
        model: BaseChatModel,
        *,
        documentation_search: PythonDocumentationSearch | None = None,
        concurrency_limit: asyncio.Semaphore | None = None,
    ) -> None:
        self.model = model
        self.documentation_search = documentation_search or PythonDocumentationSearch()
        self.concurrency_limit = concurrency_limit

    async def execute(self, state: AgentState) -> dict[str, object]:
        query = state["user_message"]
        docs = (
            await self.documentation_search.search(query)
            if any(term in query.casefold() for term in ("documentation", "docs", "api"))
            else []
        )
        execute_requested = any(term in query.casefold() for term in _EXECUTION_TERMS)
        prompt = (
            "You are UniMind AI's programming tutor. Explain concepts, generate "
            "or review code, debug supplied snippets, create exercises, and "
            "evaluate proposed solutions. Do not claim code was run, tested, or "
            "validated dynamically. Do not provide execution results. If the "
            "user asks to run code, explain that an isolated restricted sandbox "
            "is not configured. Prefer small, idiomatic examples and explain "
            "assumptions. Cite supplied official Python documentation links "
            "when relevant.\n\n"
            f"Request:\n{query}\n\n"
            f"Official Python documentation results:\n{docs!r}"
        )
        content = await generate_text(
            self.model,
            prompt,
            concurrency_limit=self.concurrency_limit,
        )
        if execute_requested:
            content += (
                "\n\nCode execution was not performed: this deployment has no "
                "separately isolated restricted sandbox configured."
            )
        return {
            "agent_outputs": {
                "coding": {
                    "content": content,
                    "evidence_sufficient": True,
                    "execution_available": False,
                    "documentation": docs,
                }
            },
            "sources": docs,
        }
