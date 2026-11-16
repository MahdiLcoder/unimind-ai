# Evaluation dataset

## Status: placeholder – not yet human-reviewed

`academic_questions.jsonl` contains **50 synthetic placeholder questions** that
conform to the schema in `academic-question.schema.json`. They are **not**
suitable for reporting evaluation results. Before presenting any metrics:

1. Replace every row with questions drawn from approved university course
   materials (lecture notes, lab sheets, syllabi, regulations) under the
   institution's data use agreement.
2. Have each question reviewed and signed off by a human annotator with the
   appropriate subject-matter expertise.
3. Record the reviewer's email address in `verified_by`, the sign-off timestamp
   in `verified_at`, and the actual source document reference in
   `source_references`.
4. Replace the placeholder `relevant_chunk_ids` with real UUIDs from the
   indexed evaluation corpus (see §Indexing below).
5. Replace the placeholder `expected_citations` with the citation labels your
   system is expected to produce for each question.
6. Freeze the dataset and increment `dataset_version` to a dated string (e.g.
   `university-cs-v1-2026-11`).

Do **not** label generated questions as manually reviewed. Do **not** mix
placeholder rows with reviewed rows in the same dataset file.

## Schema

Each JSONL row must conform to `academic-question.schema.json`. Key fields:

| Field | Requirement |
|---|---|
| `question_id` | Unique string, 1–100 chars |
| `question` | 1–4096 chars, non-blank |
| `reference_answer` | Non-blank string |
| `relevant_chunk_ids` | ≥1 UUIDs of indexed document chunks |
| `expected_agents` | ≥1 of: knowledge, learning, research, coding, planning, university_services |
| `expected_citations` | ≥1 citation label strings |
| `source_references` | ≥1 source strings (URL, URN, or citation) |
| `verified_by` | Reviewer email or name, 1–200 chars |
| `verified_at` | ISO 8601 datetime with timezone |
| `dataset_version` | Version string, 1–80 chars |

The loader (`ai.evaluation.experiment.load_dataset`) rejects fewer than 50
rows, duplicate question IDs, mixed dataset versions, and rows that fail
Pydantic validation.

## Indexing

Before running the evaluation, index the source documents under the dedicated
evaluation identity:

```bash
export EVAL_USER_ID=unimind-evaluation
export EVAL_ALLOWED_COURSE_IDS=eval-course-1,eval-course-2
# Upload source documents via the /api/v1/documents/ endpoint, then capture
# the returned chunk UUIDs and populate relevant_chunk_ids in the dataset.
```

## Running the benchmark

See the main `docs/testing-evaluation-security.md` for the full command. Use a
reviewed dataset with real chunk IDs:

```bash
cd services/ai-api
PYTHONPATH=../..:. uv run python scripts/run_paired_evaluation.py \
  --dataset ../../docs/evaluation/academic_questions.jsonl \
  --output /tmp/unimind-phase6-results.jsonl
```

Add `--ragas` to include the five LLM-judge Ragas metrics (requires Ollama and
the optional evaluation dependencies; CPU inference may take several minutes per
question).
