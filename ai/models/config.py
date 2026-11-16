import os
from dataclasses import dataclass
from enum import StrEnum


class ModelProvider(StrEnum):
    HUGGINGFACE = "huggingface"
    OLLAMA = "ollama"


@dataclass(frozen=True, slots=True)
class ModelConfig:
    provider: ModelProvider
    model_id: str
    dimensions: int | None = None
    device: str = "cpu"
    batch_size: int = 8

    def __post_init__(self) -> None:
        if not self.model_id.strip():
            raise ValueError("model_id cannot be empty")
        if self.dimensions is not None and self.dimensions < 1:
            raise ValueError("dimensions must be positive")
        if self.batch_size < 1:
            raise ValueError("batch_size must be positive")


@dataclass(frozen=True, slots=True)
class RAGModelSettings:
    embedding: ModelConfig
    reranker: ModelConfig
    generation: ModelConfig
    ollama_base_url: str = "http://localhost:11434"
    reranker_enabled: bool = True

    @classmethod
    def from_environment(cls) -> "RAGModelSettings":
        embedding_id = os.getenv("HF_EMBEDDING_MODEL", "BAAI/bge-m3")
        reranker_id = os.getenv(
            "HF_RERANKER_MODEL",
            "BAAI/bge-reranker-base",
        )
        return cls(
            embedding=ModelConfig(
                provider=ModelProvider.HUGGINGFACE,
                model_id=embedding_id,
                dimensions=int(os.getenv("HF_EMBEDDING_DIMENSIONS", "1024")),
                device=os.getenv("HF_DEVICE", "cpu"),
                batch_size=int(os.getenv("HF_BATCH_SIZE", "8")),
            ),
            reranker=ModelConfig(
                provider=ModelProvider.HUGGINGFACE,
                model_id=reranker_id,
                device=os.getenv("HF_DEVICE", "cpu"),
            ),
            generation=ModelConfig(
                provider=ModelProvider.OLLAMA,
                model_id=os.getenv("OLLAMA_MODEL", "qwen2.5:3b"),
            ),
            ollama_base_url=os.getenv(
                "OLLAMA_BASE_URL",
                "http://localhost:11434",
            ).rstrip("/"),
            reranker_enabled=_environment_flag("HF_RERANKER_ENABLED", default=True),
        )


def _environment_flag(name: str, *, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean")
