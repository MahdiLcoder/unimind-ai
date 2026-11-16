from __future__ import annotations

import asyncio
from typing import Protocol, cast

import httpx

from ai.models.config import ModelConfig, ModelProvider, RAGModelSettings
from ai.models.runtime import SingleModelRuntime, default_model_runtime


class GenerationError(RuntimeError):
    pass


class TextGenerator(Protocol):
    async def generate(self, system_prompt: str, user_prompt: str) -> str: ...


class _TextGenerationPipeline(Protocol):
    def __call__(
        self,
        prompt: str,
        *,
        max_new_tokens: int,
        do_sample: bool,
        return_full_text: bool,
    ) -> list[dict[str, str]]: ...


class OllamaGenerator:
    def __init__(
        self,
        config: ModelConfig | None = None,
        base_url: str | None = None,
        timeout_seconds: float = 120,
    ) -> None:
        settings = RAGModelSettings.from_environment()
        self.config = config or settings.generation
        if self.config.provider != ModelProvider.OLLAMA:
            raise ValueError("OllamaGenerator requires an Ollama model")
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.config.model_id,
                        "stream": False,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                    },
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise GenerationError(
                f"Ollama generation request failed for {self.config.model_id}"
            ) from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("message"), dict):
            raise GenerationError("Ollama returned a malformed response")
        answer = payload["message"].get("content")
        if not isinstance(answer, str) or not answer.strip():
            raise GenerationError("Ollama returned an empty or malformed answer")
        return answer.strip()


class HuggingFaceGenerator:
    def __init__(
        self,
        config: ModelConfig,
        runtime: SingleModelRuntime = default_model_runtime,
        max_new_tokens: int = 512,
    ) -> None:
        if config.provider != ModelProvider.HUGGINGFACE:
            raise ValueError("HuggingFaceGenerator requires a Hugging Face model")
        if max_new_tokens < 1:
            raise ValueError("max_new_tokens must be positive")
        self.config = config
        self.runtime = runtime
        self.max_new_tokens = max_new_tokens

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        return await asyncio.to_thread(self._generate_sync, system_prompt, user_prompt)

    def _generate_sync(self, system_prompt: str, user_prompt: str) -> str:
        try:
            prompt = f"System: {system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
            output = self.runtime.run(
                f"text-generation:{self.config.model_id}",
                self._load_pipeline,
                lambda pipeline: pipeline(
                    prompt,
                    max_new_tokens=self.max_new_tokens,
                    do_sample=False,
                    return_full_text=False,
                ),
            )
        except GenerationError:
            raise
        except Exception as exc:
            raise GenerationError(
                f"Hugging Face generation failed for {self.config.model_id}"
            ) from exc
        if not output or not isinstance(output[0].get("generated_text"), str):
            raise GenerationError("Hugging Face returned an empty or malformed answer")
        answer = output[0]["generated_text"].strip()
        if not answer:
            raise GenerationError("Hugging Face returned an empty answer")
        return answer

    def _load_pipeline(self) -> _TextGenerationPipeline:
        try:
            from transformers import pipeline
        except ImportError as exc:
            raise GenerationError(
                "Install the 'inference' dependency group to load Hugging Face models"
            ) from exc
        return cast(
            _TextGenerationPipeline,
            pipeline(
                "text-generation",
                model=self.config.model_id,
                device=self.config.device,
            ),
        )
