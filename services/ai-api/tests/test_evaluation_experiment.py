from uuid import uuid4

import pytest
from ai.evaluation.experiment import (
    AcademicQuestion,
    SystemResult,
    load_dataset,
    run_paired_experiment,
    write_results,
)


def _question(question_id: str = "q-1") -> AcademicQuestion:
    return AcademicQuestion(
        question_id=question_id,
        question="How does retrieval augmented generation use evidence?",
        reference_answer="It uses retrieved passages to ground a generated response.",
        relevant_chunk_ids=(uuid4(),),
        expected_agents=("knowledge",),
        expected_citations=("[doc:source p.1]",),
        source_references=("https://university.example/paper",),
        verified_by="reviewer@example.edu",
        verified_at="2026-11-16T12:00:00Z",
        dataset_version="test-v1",
    )


def test_dataset_loader_requires_requested_size_and_unique_ids(tmp_path) -> None:
    path = tmp_path / "dataset.jsonl"
    path.write_text(_question().model_dump_json() + "\n", encoding="utf-8")

    with pytest.raises(ValueError, match="must contain"):
        load_dataset(path)

    assert len(load_dataset(path, minimum_questions=1, maximum_questions=5)) == 1
    row = path.read_text(encoding="utf-8")
    path.write_text(row * 2, encoding="utf-8")
    with pytest.raises(ValueError, match="unique"):
        load_dataset(path, minimum_questions=1, maximum_questions=5)


@pytest.mark.asyncio
async def test_paired_runner_keeps_shared_inputs_and_null_costs(tmp_path) -> None:
    question = _question()
    calls: list[tuple[str, str]] = []

    async def baseline(item: AcademicQuestion) -> SystemResult:
        calls.append(("baseline", item.question_id))
        return SystemResult(
            answer="baseline answer",
            retrieved_chunk_ids=item.relevant_chunk_ids,
            citations=item.expected_citations,
            selected_agents=("knowledge",),
            latency_ms=10,
        )

    async def proposed(item: AcademicQuestion) -> SystemResult:
        calls.append(("proposed", item.question_id))
        return SystemResult(
            answer="proposed answer",
            retrieved_chunk_ids=(),
            citations=("[doc:wrong]",),
            selected_agents=("research",),
            latency_ms=20,
        )

    results = await run_paired_experiment([question], baseline, proposed)

    assert calls == [("baseline", "q-1"), ("proposed", "q-1")]
    assert results[0].baseline_recall_at_k == 1
    assert results[0].proposed_recall_at_k == 0
    assert results[0].baseline_citation_correctness == 1
    assert results[0].proposed_citation_correctness == 0
    output = tmp_path / "results" / "paired.jsonl"
    write_results(output, results)
    assert '"estimated_cost_usd": null' in output.read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_paired_runner_rejects_empty_questions() -> None:
    async def unused(_item: AcademicQuestion) -> SystemResult:
        raise AssertionError("runner should not be called")

    with pytest.raises(ValueError, match="at least one"):
        await run_paired_experiment([], unused, unused)
