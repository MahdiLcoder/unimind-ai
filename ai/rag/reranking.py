from __future__ import annotations

import logging
import time
from collections.abc import Sequence
from typing import Protocol, cast

from ai.models.config import ModelConfig, ModelProvider, RAGModelSettings
from ai.models.runtime import SingleModelRuntime, default_model_runtime

logger = logging.getLogger(__name__)


class RerankingError(RuntimeError):
    pass


class Reranker(Protocol):
    model_id: str

    def rerank(
        self,
        query: str,
        documents: Sequence[str],
        top_k: int | None = None,
    ) -> list[tuple[int, float]]: ...


class _CrossEncoderModel(Protocol):
    def predict(
        self,
        sentences: list[tuple[str, str]],
        *,
        show_progress_bar: bool,
    ) -> Sequence[float]: ...


class BGEReranker:
    def __init__(
        self,
        config: ModelConfig | None = None,
        runtime: SingleModelRuntime = default_model_runtime,
        max_retries: int = 1,
    ) -> None:
        self.config = config or RAGModelSettings.from_environment().reranker
        if self.config.provider != ModelProvider.HUGGINGFACE:
            raise ValueError("BGEReranker requires a Hugging Face cross-encoder")
        if max_retries < 0:
            raise ValueError("max_retries must be non-negative")
        self.model_id = self.config.model_id
        self.runtime = runtime
        self.max_retries = max_retries

    def rerank(
        self,
        query: str,
        documents: Sequence[str],
        top_k: int | None = None,
    ) -> list[tuple[int, float]]:
        if not query.strip():
            raise ValueError("Query cannot be empty")
        if not documents:
            return []
        if top_k is not None and top_k < 1:
            raise ValueError("top_k must be positive")

        pairs = [(query, document) for document in documents]
        for attempt in range(self.max_retries + 1):
            try:
                scores = self.runtime.run(
                    f"cross-encoder:{self.model_id}",
                    self._load_model,
                    lambda model: model.predict(pairs, show_progress_bar=False),
                )
                ranked = sorted(
                    enumerate(float(score) for score in scores),
                    key=lambda item: item[1],
                    reverse=True,
                )
                return ranked[:top_k] if top_k is not None else ranked
            except Exception as exc:
                if attempt >= self.max_retries:
                    logger.exception("Reranking failed for %s", self.model_id)
                    raise RerankingError(f"Reranking failed for {self.model_id}") from exc
                time.sleep(0.25 * (2**attempt))
        raise AssertionError("unreachable")

    def _load_model(self) -> _CrossEncoderModel:
        try:
            from sentence_transformers import CrossEncoder
        except ImportError as exc:
            raise RerankingError(
                "Install the 'inference' dependency group to load Hugging Face models"
            ) from exc
        return cast(
            _CrossEncoderModel,
            CrossEncoder(self.model_id, device=self.config.device),
        )
