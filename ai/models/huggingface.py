from dataclasses import dataclass

from ai.models.config import ModelConfig


@dataclass(frozen=True, slots=True)
class HuggingFaceModelMetadata:
    model_id: str
    pipeline_tag: str | None
    library_name: str | None
    downloads: int | None
    likes: int | None
    last_modified: str | None
    tags: tuple[str, ...]


class HuggingFaceModelInspector:
    def inspect(self, model_id: str) -> HuggingFaceModelMetadata:
        from huggingface_hub import HfApi

        info = HfApi().model_info(model_id, files_metadata=False)
        return HuggingFaceModelMetadata(
            model_id=info.id or model_id,
            pipeline_tag=info.pipeline_tag,
            library_name=info.library_name,
            downloads=info.downloads,
            likes=info.likes,
            last_modified=info.last_modified.isoformat() if info.last_modified else None,
            tags=tuple(info.tags or ()),
        )

    @staticmethod
    def validate_config(config: ModelConfig) -> None:
        if not config.model_id.strip():
            raise ValueError("A Hugging Face model ID is required")
