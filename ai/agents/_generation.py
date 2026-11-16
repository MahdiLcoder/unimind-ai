from __future__ import annotations

import asyncio

from langchain_core.language_models.chat_models import BaseChatModel


async def generate_text(
    model: BaseChatModel,
    prompt: str,
    *,
    concurrency_limit: asyncio.Semaphore | None = None,
) -> str:
    if concurrency_limit is None:
        response = await model.ainvoke(prompt)
    else:
        async with concurrency_limit:
            response = await model.ainvoke(prompt)
    content = response.content
    if isinstance(content, str):
        text = content.strip()
    elif isinstance(content, list):
        text = "\n".join(
            str(block["text"])
            for block in content
            if isinstance(block, dict) and isinstance(block.get("text"), str)
        ).strip()
    else:
        text = ""
    if not text:
        raise ValueError("The language model returned an empty response")
    return text
