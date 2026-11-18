"""Run direct-RAG and LangGraph supervisor systems on one reviewed JSONL set."""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import statistics
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from ai.agents.schemas import AgentRunRequest, UserRole
from ai.agents.service import AgentService, connect_agent_service
from ai.evaluation.experiment import (
    AcademicQuestion,
    PairedResult,
    SystemResult,
    load_dataset,
    run_paired_experiment,
    write_results,
)
from ai.evaluation.ragas_adapter import evaluate_with_ragas
from ai.models.config import RAGModelSettings

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine


async def run(
    dataset_path: Path,
    output_path: Path,
    *,
    with_ragas: bool,
    limit: int | None = None,
) -> int:
    minimum = 1 if limit else 50
    questions = load_dataset(dataset_path, minimum_questions=minimum)
    if limit is not None:
        questions = questions[:limit]
    user_id = os.environ.get("EVAL_USER_ID", "unimind-evaluation")
    allowed_course_ids = frozenset(
        course_id.strip()
        for course_id in os.environ.get("EVAL_ALLOWED_COURSE_IDS", "").split(",")
        if course_id.strip()
    )
    service = await connect_agent_service(settings.sqlalchemy_database_url, AsyncSessionLocal)

    async def direct_rag(question: AcademicQuestion) -> SystemResult:
        started = perf_counter()
        try:
            rag = service.rag_service
            if rag is None:
                raise RuntimeError("RAG service is not configured")
            async with AsyncSessionLocal() as session:
                retrieval = await rag.retrieve(
                    session,
                    question.question,
                    user_id=user_id,
                    allowed_course_ids=allowed_course_ids,
                    top_k=5,
                )
                answer = await rag.answer_from_retrieval(retrieval, started_at=started)
            return SystemResult(
                answer=answer.answer,
                retrieved_chunk_ids=tuple(chunk.id for chunk in retrieval.chunks),
                retrieved_contexts=tuple(chunk.content for chunk in retrieval.chunks),
                citations=tuple(citation.citation for citation in answer.sources),
                route_applicable=False,
                latency_ms=(perf_counter() - started) * 1000,
            )
        except Exception as exc:
            return SystemResult(
                answer="",
                latency_ms=(perf_counter() - started) * 1000,
                failure=type(exc).__name__,
            )

    async def supervisor(question: AcademicQuestion) -> SystemResult:
        started = perf_counter()
        try:
            request = AgentRunRequest(
                user_id=user_id,
                conversation_id=uuid4(),
                message=question.question,
                role=UserRole.STUDENT,
                allowed_course_ids=allowed_course_ids,
            )
            state = await service.graphs.supervisor.ainvoke(
                AgentService._input(request),
                config=AgentService._config(user_id, request.conversation_id),
            )
            chunks = state.get("retrieved_documents", [])
            source_items = state.get("sources", [])
            citations = tuple(
                str(item["citation"])
                for item in source_items
                if isinstance(item, dict) and item.get("citation")
            )
            return SystemResult(
                answer=str(state.get("final_response", "")),
                retrieved_chunk_ids=tuple(
                    __import__("uuid").UUID(str(item["chunk_id"]))
                    for item in chunks
                    if isinstance(item, dict) and item.get("chunk_id")
                ),
                retrieved_contexts=tuple(
                    str(item["content"])
                    for item in chunks
                    if isinstance(item, dict) and item.get("content")
                ),
                citations=citations,
                selected_agents=tuple(
                    agent.value for agent in state.get("selected_agents", [])
                ),
                latency_ms=(perf_counter() - started) * 1000,
            )
        except Exception as exc:
            return SystemResult(
                answer="",
                latency_ms=(perf_counter() - started) * 1000,
                failure=type(exc).__name__,
            )

    try:
        results = await run_paired_experiment(questions, direct_rag, supervisor)
        if with_ragas:
            results = await _add_ragas_scores(results, questions)
        write_results(output_path, results)
        artifacts = _write_reports(
            output_path,
            results,
            dataset_version=questions[0].dataset_version,
            ragas_requested=with_ragas,
        )
        print(f"Wrote {len(results)} paired records to {output_path}")
        for artifact in artifacts:
            print(f"Wrote report artifact to {artifact}")
        return 0
    finally:
        await service.close()
        await engine.dispose()


async def _add_ragas_scores(
    results: list[PairedResult],
    questions: list[AcademicQuestion],
) -> list[PairedResult]:
    """Ragas output is written alongside rows without fabricating failed scores."""
    from dataclasses import replace

    question_by_id = {question.question_id: question for question in questions}
    scored: list[PairedResult] = []
    for result in results:
        question = question_by_id[result.question_id]
        values: dict[str, object] = {}
        for name, output in (("baseline", result.baseline), ("proposed", result.proposed)):
            if output.failure:
                values[f"{name}_ragas_failure"] = output.failure
                continue
            sample = _RagasSample(
                question=question.question,
                reference_answer=question.reference_answer,
                answer=output.answer,
                contexts=output.retrieved_contexts,
            )
            try:
                values[f"{name}_ragas"] = await evaluate_with_ragas(sample)
            except Exception as exc:
                values[f"{name}_ragas_failure"] = type(exc).__name__
        scored.append(replace(result, **values))
    return scored


class _RagasSample:
    def __init__(
        self,
        *,
        question: str,
        reference_answer: str,
        answer: str,
        contexts: tuple[str, ...],
    ) -> None:
        self.question = question
        self.reference_answer = reference_answer
        self.answer = answer
        self.contexts = contexts


def _summary(results: list[PairedResult]) -> dict[str, object]:
    output: dict[str, object] = {"questions": len(results)}
    for system in ("baseline", "proposed"):
        rows = [(result, getattr(result, system)) for result in results]
        latencies = [answer.latency_ms for _, answer in rows]
        output[system] = {
            "failure_count": sum(answer.failure is not None for _, answer in rows),
            "mean_latency_ms": statistics.fmean(latencies) if latencies else None,
            "mean_recall_at_k": statistics.fmean(
                getattr(result, f"{system}_recall_at_k") for result, _ in rows
            ),
            "mean_precision_at_k": statistics.fmean(
                getattr(result, f"{system}_precision_at_k") for result, _ in rows
            ),
            "mean_mrr": statistics.fmean(
                getattr(result, f"{system}_mrr") for result, _ in rows
            ),
            "mean_citation_correctness": statistics.fmean(
                getattr(result, f"{system}_citation_correctness") for result, _ in rows
            ),
            "operational_task_success_rate": statistics.fmean(
                getattr(result, f"{system}_task_success") for result, _ in rows
            ),
            "mean_routing_accuracy": _mean_known(
                getattr(result, f"{system}_routing_accuracy") for result, _ in rows
            ),
            "input_tokens": _sum_known(answer.input_tokens for _, answer in rows),
            "output_tokens": _sum_known(answer.output_tokens for _, answer in rows),
            "estimated_cost_usd": _sum_known(
                answer.estimated_cost_usd for _, answer in rows
            ),
            "mean_ragas": _mean_ragas(rows, system),
            "ragas_failure_count": sum(
                getattr(result, f"{system}_ragas_failure") is not None
                for result, _ in rows
            ),
            "failures": [
                {"question_id": result.question_id, "error_type": answer.failure}
                for result, answer in rows
                if answer.failure
            ],
        }
    return output


def _sum_known(values):
    items = list(values)
    if not items or any(value is None for value in items):
        return None
    return sum(items)


def _format_metric(value: float | None) -> str:
    return f"{value:.3f}" if value is not None else "N/A"


def _mean_known(values):
    items = [value for value in values if value is not None]
    return statistics.fmean(items) if items else None


def _mean_ragas(
    rows: list[tuple[PairedResult, SystemResult]], system_name: str
) -> dict[str, float | None]:
    names = (
        "context_precision",
        "context_recall",
        "faithfulness",
        "answer_relevancy",
        "factual_correctness",
    )
    output: dict[str, float | None] = {}
    for metric in names:
        scores = [
            score
            for result, answer in rows
            if answer.failure is None
            for scores in [getattr(result, f"{system_name}_ragas")]
            for score in [scores.get(metric) if scores else None]
            if score is not None
        ]
        output[metric] = statistics.fmean(scores) if scores else None
    return output


def _write_reports(
    output_path: Path,
    results: list[PairedResult],
    *,
    dataset_version: str,
    ragas_requested: bool,
) -> tuple[Path, ...]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary = _summary(results)
    model_settings = RAGModelSettings.from_environment()
    summary["dataset_version"] = dataset_version
    summary["top_k"] = 5
    summary["ragas_requested"] = ragas_requested
    summary["generation_model"] = model_settings.generation.model_id
    summary["embedding_model"] = model_settings.embedding.model_id
    summary["reranker_enabled"] = model_settings.reranker_enabled
    json_path = output_path.with_suffix(".summary.json")
    csv_path = output_path.with_suffix(".csv")
    chart_path = output_path.with_suffix(".svg")
    report_path = output_path.with_suffix(".report.md")
    json_path.write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    with csv_path.open("w", encoding="utf-8", newline="") as result_file:
        fields = [
            "question_id", "baseline_failure", "proposed_failure",
            "baseline_latency_ms", "proposed_latency_ms",
            "baseline_input_tokens", "proposed_input_tokens",
            "baseline_output_tokens", "proposed_output_tokens",
            "baseline_estimated_cost_usd", "proposed_estimated_cost_usd",
            "baseline_recall_at_k", "proposed_recall_at_k",
            "baseline_precision_at_k", "proposed_precision_at_k",
            "baseline_mrr", "proposed_mrr",
            "baseline_citation_correctness", "proposed_citation_correctness",
            "baseline_routing_accuracy", "proposed_routing_accuracy",
            "baseline_task_success", "proposed_task_success",
            "baseline_ragas_failure", "proposed_ragas_failure",
            "baseline_context_precision", "proposed_context_precision",
            "baseline_context_recall", "proposed_context_recall",
            "baseline_faithfulness", "proposed_faithfulness",
            "baseline_answer_relevancy", "proposed_answer_relevancy",
            "baseline_factual_correctness", "proposed_factual_correctness",
        ]
        writer = csv.DictWriter(result_file, fieldnames=fields)
        writer.writeheader()
        for item in results:
            writer.writerow({
                "question_id": item.question_id,
                "baseline_failure": item.baseline.failure,
                "proposed_failure": item.proposed.failure,
                "baseline_latency_ms": item.baseline.latency_ms,
                "proposed_latency_ms": item.proposed.latency_ms,
                "baseline_input_tokens": item.baseline.input_tokens,
                "proposed_input_tokens": item.proposed.input_tokens,
                "baseline_output_tokens": item.baseline.output_tokens,
                "proposed_output_tokens": item.proposed.output_tokens,
                "baseline_estimated_cost_usd": item.baseline.estimated_cost_usd,
                "proposed_estimated_cost_usd": item.proposed.estimated_cost_usd,
                "baseline_recall_at_k": item.baseline_recall_at_k,
                "proposed_recall_at_k": item.proposed_recall_at_k,
                "baseline_precision_at_k": item.baseline_precision_at_k,
                "proposed_precision_at_k": item.proposed_precision_at_k,
                "baseline_mrr": item.baseline_mrr,
                "proposed_mrr": item.proposed_mrr,
                "baseline_citation_correctness": item.baseline_citation_correctness,
                "proposed_citation_correctness": item.proposed_citation_correctness,
                "baseline_routing_accuracy": item.baseline_routing_accuracy,
                "proposed_routing_accuracy": item.proposed_routing_accuracy,
                "baseline_task_success": item.baseline_task_success,
                "proposed_task_success": item.proposed_task_success,
                "baseline_ragas_failure": item.baseline_ragas_failure,
                "proposed_ragas_failure": item.proposed_ragas_failure,
                **{
                    f"{system}_{metric}": (scores or {}).get(metric)
                    for system, scores in (
                        ("baseline", item.baseline_ragas),
                        ("proposed", item.proposed_ragas),
                    )
                    for metric in (
                        "context_precision", "context_recall", "faithfulness",
                        "answer_relevancy", "factual_correctness",
                    )
                },
            })
    chart_path.write_text(_comparison_svg(summary), encoding="utf-8")
    report_path.write_text(_markdown_report(results, summary), encoding="utf-8")
    return json_path, csv_path, chart_path, report_path


def _comparison_svg(summary: dict[str, object]) -> str:
    metric_names = (
        "mean_recall_at_k", "mean_precision_at_k", "mean_mrr",
        "mean_citation_correctness", "operational_task_success_rate",
        "mean_routing_accuracy",
        "ragas:context_precision", "ragas:context_recall", "ragas:faithfulness",
        "ragas:answer_relevancy", "ragas:factual_correctness",
    )
    baseline = summary["baseline"]
    proposed = summary["proposed"]
    assert isinstance(baseline, dict) and isinstance(proposed, dict)
    rows: list[str] = []
    for index, name in enumerate(metric_names):
        y = 42 + index * 58
        label = name.removeprefix("mean_").replace("_", " ").replace(":", " ")
        rows.append(f'<text x="8" y="{y + 18}" font-size="13">{label}</text>')
        for system, color, offset in ((baseline, "#64748b", 0), (proposed, "#2563eb", 21)):
            if name.startswith("ragas:"):
                ragas_values = system.get("mean_ragas")
                raw = (
                    ragas_values.get(name.split(":", 1)[1])
                    if isinstance(ragas_values, dict)
                    else None
                )
            else:
                raw = system.get(name)
            if raw is None:
                rows.append(f'<text x="176" y="{y + offset + 13}" font-size="11">N/A</text>')
                continue
            value = float(raw)
            width = max(0.0, min(1.0, value)) * 320
            rows.append(
                f'<rect x="170" y="{y + offset}" width="{width:.1f}" height="16" fill="{color}"/>'
            )
            rows.append(
                f'<text x="{176 + width:.1f}" y="{y + offset + 13}" font-size="11">'
                f"{value:.3f}</text>"
            )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="710" role="img" '
        'aria-label="Paired evaluation metric comparison">'
        '<rect width="100%" height="100%" fill="white"/>'
        '<text x="8" y="20" font-size="16" font-weight="bold">Paired evaluation averages</text>'
        '<rect x="390" y="8" width="12" height="12" fill="#64748b"/>'
        '<text x="406" y="19" font-size="11">Direct RAG</text>'
        '<rect x="470" y="8" width="12" height="12" fill="#2563eb"/>'
        '<text x="486" y="19" font-size="11">Supervisor</text>'
        + "".join(rows)
        + "</svg>\n"
    )


def _markdown_report(results: list[PairedResult], summary: dict[str, object]) -> str:
    settings = RAGModelSettings.from_environment()
    timestamp = datetime.now(UTC).isoformat()
    rows = []
    for key, title in (("baseline", "Direct RAG"), ("proposed", "LangGraph Supervisor")):
        values = summary[key]
        assert isinstance(values, dict)
        rows.append(
            f"| {title} | {values['failure_count']} | {values['mean_latency_ms']:.1f} "
            f"| {values['mean_recall_at_k']:.3f} | {values['mean_precision_at_k']:.3f} "
            f"| {values['mean_mrr']:.3f} | {values['mean_citation_correctness']:.3f} "
            f"| {values['operational_task_success_rate']:.3f} "
            f"| {_format_metric(values['mean_routing_accuracy'])} "
            f"| {_format_metric(values['input_tokens'])} "
            f"| {_format_metric(values['output_tokens'])} "
            f"| {_format_metric(values['estimated_cost_usd'])} |"
        )
    return (
        "# Paired UniMind AI Evaluation\n\n"
        f"- Run time (UTC): `{timestamp}`\n"
        f"- Questions: {len(results)}\n"
        f"- Dataset version: `{summary['dataset_version']}`\n"
        f"- Generation model: `{settings.generation.model_id}`\n"
        f"- Embedding model: `{settings.embedding.model_id}`\n"
        f"- Ragas enabled: `{summary['ragas_requested']}`\n"
        "- Pairing: same reviewed question, sequential runs, "
        "same configured model and retrieval system.\n"
        "- Routing accuracy is not applicable to the direct-RAG baseline.\n"
        "- Operational success requires a completed non-empty answer, "
        "all cited labels in the reviewed allowlist, and an exact expected route "
        "when routing applies. It is not a factuality score.\n"
        "- Failures are retained as per-question failure types; "
        "token and cost values remain null when providers do not expose usage or pricing.\n\n"
        "| System | Failures | Mean latency ms | Recall@5 | Precision@5 | MRR "
        "| Citation correctness | Operational success | Routing accuracy "
        "| Input tokens | Output tokens | Estimated cost USD |\n"
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n"
        + "\n".join(rows)
        + "\n\n## Ragas metrics\n\n"
        + _ragas_table(summary)
        + "\n\n## Error analysis\n\n"
        + _error_lines(results)
        + "\n## Limits\n\n"
        "Quality metrics from Ragas are separate per-question measurements when "
        "`--ragas` is enabled. They are LLM-judge estimates and should be "
        "interpreted alongside the reviewer labels. "
        "This report does not claim statistical significance.\n"
    )


def _ragas_table(summary: dict[str, object]) -> str:
    lines = [
        "| System | Context precision | Context recall | Faithfulness "
        "| Answer relevancy | Factual correctness |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for key, title in (("baseline", "Direct RAG"), ("proposed", "LangGraph Supervisor")):
        system = summary[key]
        assert isinstance(system, dict)
        metrics = system["mean_ragas"]
        assert isinstance(metrics, dict)
        lines.append(
            f"| {title} | "
            + " | ".join(
                _format_metric(metrics[name])
                for name in (
                    "context_precision", "context_recall", "faithfulness",
                    "answer_relevancy", "factual_correctness",
                )
            )
            + " |"
        )
    return "\n".join(lines)


def _error_lines(results: list[PairedResult]) -> str:
    failures = [
        f"- `{result.question_id}`: {system} failed ({answer.failure})."
        for result in results
        for system, answer in (("direct RAG", result.baseline), ("supervisor", result.proposed))
        if answer.failure
    ]
    mismatches = [
        f"- `{result.question_id}`: routing or citation labels did not fully match reviewer labels."
        for result in results
        if result.proposed_routing_accuracy is not None
        and result.proposed_routing_accuracy < 1
        or result.proposed_citation_correctness < 1
    ]
    ragas_failures = [
        f"- `{result.question_id}`: {system} Ragas scoring failed ({failure})."
        for result in results
        for system, failure in (
            ("direct RAG", result.baseline_ragas_failure),
            ("supervisor", result.proposed_ragas_failure),
        )
        if failure
    ]
    details = failures + mismatches + ragas_failures
    return "\n".join(details) if details else "No failures or label mismatches were recorded."


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ragas", action="store_true", help="run optional local Ragas judges")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="limit the number of evaluated questions (for smoke tests and verification)",
    )
    args = parser.parse_args()
    return asyncio.run(
        run(args.dataset, args.output, with_ragas=args.ragas, limit=args.limit)
    )


if __name__ == "__main__":
    raise SystemExit(main())
