"""Paired, per-question experiment primitives for UniMind RAG evaluations.

The module contains no model or database setup. Callers inject real system
runners, which keeps tests deterministic and avoids silently measuring fakes.
"""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AcademicQuestion(BaseModel):
    """A human-reviewed question and its stable retrieval/routing labels."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    question_id: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=1, max_length=4096)
    reference_answer: str = Field(min_length=1)
    relevant_chunk_ids: tuple[UUID, ...] = Field(min_length=1)
    expected_agents: tuple[str, ...] = Field(min_length=1)
    expected_citations: tuple[str, ...] = Field(min_length=1)
    source_references: tuple[str, ...] = Field(min_length=1)
    verified_by: str = Field(min_length=1, max_length=200)
    verified_at: datetime
    dataset_version: str = Field(min_length=1, max_length=80)

    @field_validator("question", "reference_answer", "verified_by")
    @classmethod
    def reject_whitespace_only(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value

    @field_validator("expected_agents", "expected_citations", "source_references")
    @classmethod
    def reject_empty_labels(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        if any(not value.strip() for value in values):
            raise ValueError("labels must not be blank")
        return values

    @field_validator("expected_agents")
    @classmethod
    def validate_agent_names(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        allowed = {
            "knowledge", "learning", "research", "coding", "planning",
            "university_services",
        }
        if any(value not in allowed for value in values):
            raise ValueError("expected_agents contains an unknown agent")
        return values

    @field_validator("verified_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("verified_at must include a timezone")
        return value.astimezone(UTC)


class SystemResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    answer: str
    retrieved_chunk_ids: tuple[UUID, ...] = ()
    retrieved_contexts: tuple[str, ...] = ()
    citations: tuple[str, ...] = ()
    selected_agents: tuple[str, ...] = ()
    route_applicable: bool = True
    latency_ms: float = Field(ge=0)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    estimated_cost_usd: float | None = Field(default=None, ge=0)
    failure: str | None = None

    @field_validator("latency_ms", "estimated_cost_usd")
    @classmethod
    def require_finite(cls, value: float | None) -> float | None:
        if value is not None and not math.isfinite(value):
            raise ValueError("measurement must be finite")
        return value


class ExperimentRunner(Protocol):
    async def __call__(self, question: AcademicQuestion) -> SystemResult: ...


@dataclass(frozen=True, slots=True)
class PairedResult:
    question_id: str
    baseline: SystemResult
    proposed: SystemResult
    baseline_recall_at_k: float
    proposed_recall_at_k: float
    baseline_precision_at_k: float
    proposed_precision_at_k: float
    baseline_mrr: float
    proposed_mrr: float
    baseline_citation_correctness: float
    proposed_citation_correctness: float
    baseline_routing_accuracy: float | None
    proposed_routing_accuracy: float | None
    baseline_task_success: float
    proposed_task_success: float
    baseline_ragas: dict[str, float] | None = None
    proposed_ragas: dict[str, float] | None = None
    baseline_ragas_failure: str | None = None
    proposed_ragas_failure: str | None = None


def load_dataset(
    path: Path,
    *,
    minimum_questions: int = 50,
    maximum_questions: int = 100,
) -> list[AcademicQuestion]:
    """Read validated JSONL and refuse incomplete/unreviewed benchmarks."""
    if minimum_questions < 1 or maximum_questions < minimum_questions:
        raise ValueError("invalid dataset size bounds")
    questions: list[AcademicQuestion] = []
    with path.open(encoding="utf-8") as dataset_file:
        for line_number, line in enumerate(dataset_file, start=1):
            if not line.strip():
                continue
            try:
                questions.append(AcademicQuestion.model_validate_json(line))
            except ValueError as exc:
                raise ValueError(f"invalid dataset row at line {line_number}: {exc}") from exc
    if not minimum_questions <= len(questions) <= maximum_questions:
        raise ValueError(
            f"dataset must contain {minimum_questions} to {maximum_questions} questions; "
            f"found {len(questions)}"
        )
    ids = [question.question_id for question in questions]
    if len(ids) != len(set(ids)):
        raise ValueError("dataset question_id values must be unique")
    versions = {question.dataset_version for question in questions}
    if len(versions) != 1:
        raise ValueError("all questions must use one dataset_version")
    return questions


async def run_paired_experiment(
    questions: Sequence[AcademicQuestion],
    baseline: ExperimentRunner,
    proposed: ExperimentRunner,
    *,
    top_k: int = 5,
) -> list[PairedResult]:
    """Run both systems for each identical input and retain per-question data."""
    if not questions:
        raise ValueError("at least one verified question is required")
    if top_k < 1:
        raise ValueError("top_k must be positive")
    output: list[PairedResult] = []
    for index, question in enumerate(questions):
        # Serial execution avoids exhausting the CPU-only inference host and
        # alternating order reduces systematic warm-cache/order advantage.
        if index % 2:
            proposed_result = await proposed(question)
            baseline_result = await baseline(question)
        else:
            baseline_result = await baseline(question)
            proposed_result = await proposed(question)
        expected_chunks = set(question.relevant_chunk_ids)
        baseline_metrics = _retrieval_metrics(baseline_result, expected_chunks, top_k)
        proposed_metrics = _retrieval_metrics(proposed_result, expected_chunks, top_k)
        baseline_citations = _citation_accuracy(
            baseline_result.citations, question.expected_citations
        )
        proposed_citations = _citation_accuracy(
            proposed_result.citations, question.expected_citations
        )
        baseline_routing = _routing_accuracy(
            baseline_result.selected_agents,
            question.expected_agents,
            applicable=baseline_result.route_applicable,
        )
        proposed_routing = _routing_accuracy(
            proposed_result.selected_agents,
            question.expected_agents,
            applicable=proposed_result.route_applicable,
        )
        output.append(
            PairedResult(
                question_id=question.question_id,
                baseline=baseline_result,
                proposed=proposed_result,
                baseline_recall_at_k=baseline_metrics[0],
                proposed_recall_at_k=proposed_metrics[0],
                baseline_precision_at_k=baseline_metrics[1],
                proposed_precision_at_k=proposed_metrics[1],
                baseline_mrr=baseline_metrics[2],
                proposed_mrr=proposed_metrics[2],
                baseline_citation_correctness=baseline_citations,
                proposed_citation_correctness=proposed_citations,
                baseline_routing_accuracy=baseline_routing,
                proposed_routing_accuracy=proposed_routing,
                baseline_task_success=_operational_success(
                    baseline_result, baseline_citations, baseline_routing
                ),
                proposed_task_success=_operational_success(
                    proposed_result, proposed_citations, proposed_routing
                ),
            )
        )
    return output


def write_results(path: Path, results: Sequence[PairedResult]) -> None:
    """Write lossless per-question JSONL; absent token/cost values stay null."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as result_file:
        for result in results:
            record = {
                "question_id": result.question_id,
                "baseline": result.baseline.model_dump(mode="json"),
                "proposed": result.proposed.model_dump(mode="json"),
                "baseline_recall_at_k": result.baseline_recall_at_k,
                "proposed_recall_at_k": result.proposed_recall_at_k,
                "baseline_precision_at_k": result.baseline_precision_at_k,
                "proposed_precision_at_k": result.proposed_precision_at_k,
                "baseline_mrr": result.baseline_mrr,
                "proposed_mrr": result.proposed_mrr,
                "baseline_citation_correctness": result.baseline_citation_correctness,
                "proposed_citation_correctness": result.proposed_citation_correctness,
                "baseline_routing_accuracy": result.baseline_routing_accuracy,
                "proposed_routing_accuracy": result.proposed_routing_accuracy,
                "baseline_task_success": result.baseline_task_success,
                "proposed_task_success": result.proposed_task_success,
                "baseline_ragas": result.baseline_ragas,
                "proposed_ragas": result.proposed_ragas,
                "baseline_ragas_failure": result.baseline_ragas_failure,
                "proposed_ragas_failure": result.proposed_ragas_failure,
            }
            result_file.write(json.dumps(record, sort_keys=True) + "\n")


def _retrieval_metrics(
    result: SystemResult,
    expected: set[UUID],
    top_k: int,
) -> tuple[float, float, float]:
    retrieved = result.retrieved_chunk_ids[:top_k]
    hits = [chunk_id in expected for chunk_id in retrieved]
    hit_count = sum(hits)
    recall = hit_count / len(expected) if expected else 0.0
    precision = hit_count / top_k
    mrr = next((1 / rank for rank, hit in enumerate(hits, start=1) if hit), 0.0)
    return recall, precision, mrr


def _citation_accuracy(citations: Sequence[str], expected: Sequence[str]) -> float:
    if not citations:
        return 0.0
    expected_set = set(expected)
    return sum(citation in expected_set for citation in citations) / len(citations)


def _routing_accuracy(
    selected: Sequence[str], expected: Sequence[str], *, applicable: bool
) -> float | None:
    if not applicable:
        return None
    return float(set(selected) == set(expected))


def _operational_success(
    result: SystemResult,
    citation_correctness: float,
    routing_accuracy: float | None,
) -> float:
    completed = result.failure is None and bool(result.answer.strip())
    citations_ok = citation_correctness == 1.0
    route_ok = routing_accuracy is None or routing_accuracy == 1.0
    return float(completed and citations_ok and route_ok)
