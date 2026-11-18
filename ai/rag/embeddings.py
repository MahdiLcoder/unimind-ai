from __future__ import annotations

import hashlib
import logging
import math
import time
from collections import OrderedDict
from collections.abc import Sequence
from pathlib import Path
from threading import Lock
from typing import Protocol, cast

from ai.models.config import ModelConfig, ModelProvider, RAGModelSettings
from ai.models.runtime import SingleModelRuntime, default_model_runtime

logger = logging.getLogger(__name__)


class EmbeddingError(RuntimeError):
    pass


class EmbeddingProvider(Protocol):
    model_id: str
    dimensions: int

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


class _EmbeddingArray(Protocol):
    def tolist(self) -> list[list[float]]: ...


class _SentenceTransformerModel(Protocol):
    def encode(
        self,
        sentences: list[str],
        *,
        batch_size: int,
        convert_to_numpy: bool,
        normalize_embeddings: bool,
        show_progress_bar: bool,
    ) -> _EmbeddingArray: ...


class EmbeddingCache:
    def __init__(self, max_entries: int = 1024) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be positive")
        self.max_entries = max_entries
        self._values: OrderedDict[tuple[str, str], list[float]] = OrderedDict()
        self._lock = Lock()

    def get(self, model_id: str, text: str) -> list[float] | None:
        key = (model_id, hashlib.sha256(text.encode("utf-8")).hexdigest())
        with self._lock:
            value = self._values.get(key)
            if value is not None:
                self._values.move_to_end(key)
                return value.copy()
        return None

    def set(self, model_id: str, text: str, vector: list[float]) -> None:
        key = (model_id, hashlib.sha256(text.encode("utf-8")).hexdigest())
        with self._lock:
            self._values[key] = vector.copy()
            self._values.move_to_end(key)
            while len(self._values) > self.max_entries:
                self._values.popitem(last=False)


class SentenceTransformerEmbedder:
    def __init__(
        self,
        config: ModelConfig | None = None,
        runtime: SingleModelRuntime = default_model_runtime,
        cache: EmbeddingCache | None = None,
        max_retries: int = 2,
    ) -> None:
        self.config = config or RAGModelSettings.from_environment().embedding
        if self.config.provider != ModelProvider.HUGGINGFACE:
            raise ValueError("SentenceTransformerEmbedder requires a Hugging Face model")
        if self.config.dimensions is None:
            raise ValueError("Embedding dimensions must be configured")
        if max_retries < 0:
            raise ValueError("max_retries must be non-negative")
        self.model_id = self.config.model_id
        self.dimensions = self.config.dimensions
        self.runtime = runtime
        self.cache = cache or EmbeddingCache()
        self.max_retries = max_retries

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        if any(not text.strip() for text in texts):
            raise ValueError("Embedding input cannot contain empty text")
        results: list[list[float] | None] = [None] * len(texts)
        missing_indices: list[int] = []
        missing_texts: list[str] = []
        for index, text in enumerate(texts):
            cached = self.cache.get(self.model_id, text)
            if cached is None:
                missing_indices.append(index)
                missing_texts.append(text)
            else:
                results[index] = cached

        if missing_texts:
            vectors = self._encode_with_retries(missing_texts)
            if len(vectors) != len(missing_texts):
                raise EmbeddingError("Embedding model returned an unexpected batch size")
            for index, text, vector in zip(missing_indices, missing_texts, vectors, strict=True):
                if len(vector) != self.dimensions:
                    raise EmbeddingError(
                        f"Model {self.model_id} returned {len(vector)} dimensions; "
                        f"configured for {self.dimensions}"
                    )
                values = [float(value) for value in vector]
                if not all(math.isfinite(value) for value in values):
                    raise EmbeddingError("Embedding model returned a non-finite value")
                if not any(value != 0.0 for value in values):
                    raise EmbeddingError("Embedding model returned a zero vector")
                self.cache.set(self.model_id, text, values)
                results[index] = values
        complete: list[list[float]] = []
        for vector in results:
            if vector is None:
                raise EmbeddingError("Embedding batch contains a missing result")
            complete.append(vector)
        return complete

    def _encode_with_retries(self, texts: list[str]) -> list[list[float]]:
        for attempt in range(self.max_retries + 1):
            try:
                values = self.runtime.run(
                    f"sentence-transformers:{self.model_id}",
                    self._load_model,
                    lambda model: model.encode(
                        texts,
                        batch_size=self.config.batch_size,
                        convert_to_numpy=True,
                        normalize_embeddings=True,
                        show_progress_bar=False,
                    ).tolist(),
                )
                return values
            except Exception as exc:
                if attempt >= self.max_retries:
                    logger.exception("Embedding generation failed for %s", self.model_id)
                    raise EmbeddingError(
                        f"Embedding generation failed for {self.model_id}"
                    ) from exc
                time.sleep(0.25 * (2**attempt))
        raise AssertionError("unreachable")

    def _load_model(self) -> _SentenceTransformerModel:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise EmbeddingError(
                "Install the 'inference' dependency group to load Hugging Face models"
            ) from exc

        local_files_only = _model_is_cached(self.model_id)
        return cast(
            _SentenceTransformerModel,
            SentenceTransformer(
                self.model_id,
                device=self.config.device,
                local_files_only=local_files_only,
            ),
        )


def _model_is_cached(model_id: str) -> bool:
    """Return True when the model files are already in the local HF cache."""
    try:
        from huggingface_hub import try_to_load_from_cache
    except ImportError:
        return False
    try:
        cached = try_to_load_from_cache(repo_id=model_id, filename="config.json")
    except Exception:
        return False
    if cached is None:
        return False
    return Path(cached).is_file()
