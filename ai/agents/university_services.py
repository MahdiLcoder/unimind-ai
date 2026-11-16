from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Protocol

from langchain_core.language_models.chat_models import BaseChatModel
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from ai.agents._generation import generate_text
from ai.state.agent import AgentState


class OfficialUniversityDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    title: str = Field(min_length=1, max_length=512)
    url: HttpUrl
    content: str = Field(min_length=1, max_length=20000)
    verified_official: bool


class OfficialUniversitySearch(Protocol):
    async def search(self, query: str) -> Sequence[OfficialUniversityDocument]: ...


class UniversityServicesAgent:
    """Answer administrative questions only from an explicitly trusted source."""

    def __init__(
        self,
        model: BaseChatModel,
        *,
        source: OfficialUniversitySearch | None = None,
        concurrency_limit: asyncio.Semaphore | None = None,
    ) -> None:
        self.model = model
        self.source = source
        self.concurrency_limit = concurrency_limit

    async def execute(self, state: AgentState) -> dict[str, object]:
        if self.source is None:
            return _unverified_result()

        documents = await self.source.search(state["user_message"])
        verified = [document for document in documents if document.verified_official]
        if not verified:
            return _unverified_result()

        evidence = [
            {
                "title": document.title,
                "url": str(document.url),
                "content": document.content,
            }
            for document in verified
        ]
        content = await generate_text(
            self.model,
            "You are UniMind AI's university services assistant. Answer only "
            "from the verified official university documents below. Do not "
            "generalize rules, invent steps, infer deadlines, or treat a missing "
            "detail as confirmed. If the documents do not answer the question, "
            "say so and direct the student to the official source. Include source "
            "links and distinguish quoted policy from explanation.\n\n"
            f"Question:\n{state['user_message']}\n\n"
            f"Verified official sources:\n{evidence!r}",
            concurrency_limit=self.concurrency_limit,
        )
        return {
            "agent_outputs": {
                "university_services": {
                    "content": content,
                    "evidence_sufficient": True,
                    "sources": [
                        {"title": document.title, "url": str(document.url)}
                        for document in verified
                    ],
                }
            },
            "sources": [
                {"title": document.title, "url": str(document.url)}
                for document in verified
            ],
        }


def _unverified_result() -> dict[str, object]:
    return {
        "agent_outputs": {
            "university_services": {
                "content": (
                    "I could not verify this procedure from configured official "
                    "university sources. Please consult your university's official "
                    "website or student services."
                ),
                "evidence_sufficient": False,
                "retryable": False,
                "sources": [],
            }
        },
        "sources": [],
    }
