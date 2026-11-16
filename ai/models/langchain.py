from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama

from ai.models.config import RAGModelSettings


class LangChainOllamaGenerator:
    def __init__(
        self,
        model: ChatOllama | None = None,
        *,
        concurrency_limit: asyncio.Semaphore | None = None,
    ) -> None:
        settings = RAGModelSettings.from_environment()
        self.model = model or ChatOllama(
            model=settings.generation.model_id,
            base_url=settings.ollama_base_url,
            temperature=0,
            num_thread=max(1, int(os.getenv("OLLAMA_NUM_THREAD", "4"))),
        )
        self.concurrency_limit = concurrency_limit or asyncio.Semaphore(1)
        self._prompt = ChatPromptTemplate.from_messages(
            [("system", "{system_prompt}"), ("human", "{user_prompt}")]
        )
        self._chain = self._prompt | self.model | StrOutputParser()

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        async with self.concurrency_limit:
            answer = await self._chain.ainvoke(
                {"system_prompt": system_prompt, "user_prompt": user_prompt}
            )
        if not answer.strip():
            raise RuntimeError("The configured chat model returned an empty answer")
        return answer.strip()

    async def stream(self, system_prompt: str, user_prompt: str) -> AsyncIterator[str]:
        async with self.concurrency_limit:
            async for token in self._chain.astream(
                {"system_prompt": system_prompt, "user_prompt": user_prompt}
            ):
                if token:
                    yield token
