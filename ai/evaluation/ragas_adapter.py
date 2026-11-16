"""Optional Ragas metrics using the project's configured local CPU models."""

from __future__ import annotations

import asyncio
from typing import Protocol

from ai.models.config import RAGModelSettings
from ai.rag.embeddings import SentenceTransformerEmbedder
from ai.rag.security import isolate_untrusted_text


class RagasInput(Protocol):
    question: str
    reference_answer: str
    answer: str
    contexts: tuple[str, ...]


async def evaluate_with_ragas(
    sample: RagasInput,
    *,
    embedding_model: SentenceTransformerEmbedder | None = None,
) -> dict[str, float]:
    """Run context precision/recall, faithfulness, and answer relevancy.

    Ragas is an opt-in experiment dependency and is imported only when called.
    The evaluator uses the same Ollama model ID by default, with concurrency
    restricted to one local request to fit CPU-only developer machines.
    """
    try:
        from openai import AsyncOpenAI
        from ragas.embeddings.base import BaseRagasEmbedding
        from ragas.llms import llm_factory
        from ragas.metrics.collections import (
            AnswerRelevancy,
            ContextPrecision,
            ContextRecall,
            FactualCorrectness,
            Faithfulness,
        )
    except ImportError as exc:
        raise RuntimeError(
            "Install the optional evaluation dependencies from "
            "services/ai-api/requirements-evaluation.txt"
        ) from exc

    settings = RAGModelSettings.from_environment()
    client = AsyncOpenAI(
        api_key="ollama",
        base_url=f"{settings.ollama_base_url.rstrip('/')}/v1",
        max_retries=0,
        timeout=120,
    )
    judge = llm_factory(
        settings.generation.model_id,
        provider="openai",
        client=client,
        temperature=0,
    )
    embedder = embedding_model or SentenceTransformerEmbedder(settings.embedding)
    untrusted_contexts = [isolate_untrusted_text(text) for text in sample.contexts]

    class ProjectEmbeddings(BaseRagasEmbedding):
        def embed_text(self, text: str, **_kwargs: object) -> list[float]:
            return embedder.embed([text])[0]

        async def aembed_text(self, text: str, **_kwargs: object) -> list[float]:
            return await asyncio.to_thread(self.embed_text, text)

        def embed_texts(self, texts: list[str], **_kwargs: object) -> list[list[float]]:
            return embedder.embed(texts)

        async def aembed_texts(self, texts: list[str], **_kwargs: object) -> list[list[float]]:
            return await asyncio.to_thread(self.embed_texts, texts)

    embeddings = ProjectEmbeddings()
    metrics = {
        "context_precision": (
            ContextPrecision(llm=judge),
            {
                "user_input": sample.question,
                "reference": sample.reference_answer,
                "retrieved_contexts": untrusted_contexts,
            },
        ),
        "context_recall": (
            ContextRecall(llm=judge),
            {
                "user_input": sample.question,
                "reference": sample.reference_answer,
                "retrieved_contexts": untrusted_contexts,
            },
        ),
        "faithfulness": (
            Faithfulness(llm=judge),
            {
                "user_input": sample.question,
                "response": sample.answer,
                "retrieved_contexts": untrusted_contexts,
            },
        ),
        "answer_relevancy": (
            AnswerRelevancy(llm=judge, embeddings=embeddings),
            {"user_input": sample.question, "response": sample.answer},
        ),
        "factual_correctness": (
            FactualCorrectness(llm=judge),
            {"response": sample.answer, "reference": sample.reference_answer},
        ),
    }
    values: dict[str, float] = {}
    try:
        for name, (metric, inputs) in metrics.items():
            result = await metric.ascore(**inputs)
            score = float(result.value)
            lower_bound = -1 if name == "answer_relevancy" else 0
            if not lower_bound <= score <= 1:
                raise ValueError(f"Ragas {name} score outside the expected range")
            values[name] = score
    finally:
        await client.close()
    return values
