# UniMind AI Experimental Evaluation Report

## 1. Research questions

**RQ1:** Does a LangGraph supervisor-based multi-agent RAG system improve
operational task completion over direct RAG for the same reviewed university
questions?

**RQ2:** Does supervisor routing improve or alter retrieval quality, citation
correctness, and end-to-end task success?

**RQ3:** What latency, failure, cost, and resource characteristics are
observable under the configured CPU-oriented local model setup?

## 2. Hypotheses

- **H1:** The supervisor system has equal or higher operational task success
  than direct RAG because it can route and retry specialist work.
- **H2:** Retrieval metrics are unchanged where both systems use the same
  retriever and top-K configuration.
- **H3:** Agent routing may increase latency because specialist graph execution
  adds orchestration and repeated model calls.

These hypotheses are not experimentally established by the current run.

## 3. Systems compared

### Traditional direct RAG

The direct baseline embeds the question, retrieves the top-K allowed context,
reranks when configured, and calls the configured generator. It has no
LangGraph routing decision or specialist retry.

### Supervisor multi-agent RAG

The proposed system routes the request through the LangGraph supervisor,
executes one or more specialist agents, evaluates evidence, retries eligible
agents once, advances dependency batches, and combines final output.

Both configurations use the same model/retrieval settings for each paired
question.

## 4. Dataset construction

The runner requires 50–100 Pydantic-validated questions. Each row includes:

- unique question ID;
- question and reference answer;
- relevant chunk UUIDs;
- expected agents;
- expected citation labels;
- source references;
- verified reviewer and timestamp;
- dataset version.

The current `academic_questions.jsonl` file contains 50 synthetic
`placeholder-v0` rows. It is not an approved academic corpus, and the first
two rows were the only rows used in the stored paired run. The loader and
reporting pipeline were tested, but the dataset itself was not manually
reviewed.

## 5. Evaluation methodology

The paired runner alternates system order by question index to reduce systematic
warm-cache order effects and executes serially to avoid exhausting CPU-only
inference.

Recorded metrics:

- Recall@K;
- Precision@K;
- MRR;
- citation correctness;
- routing accuracy for systems where routing applies;
- operational task success;
- end-to-end latency;
- input/output tokens;
- estimated cost;
- Ragas metrics when explicitly enabled.

Operational success is defined strictly as:

1. non-empty answer with no run error;
2. every cited label in the reviewed allowlist;
3. exact expected route where routing applies.

It is not a factuality score.

Ragas answer relevancy, context precision/recall, faithfulness, and factual
correctness are LLM-judge estimates, not direct ground-truth measurements.

## 6. Experimental configuration

Stored Phase 6 artifacts report:

- run time: 2026-11-16T19:45:22.938517Z;
- questions: 2;
- dataset: `placeholder-v0`;
- generation model: `qwen2.5:3b`;
- embedding model: `BAAI/bge-m3`;
- reranker: enabled;
- top-K: 5;
- Ragas: disabled.

No token or cost values were exposed by the provider.

## 7. Actual results

| System | Failures | Mean latency ms | Recall@5 | Precision@5 | MRR | Citation correctness | Operational success | Routing accuracy |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Direct RAG | 0 | 30674.4 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | N/A |
| LangGraph Supervisor | 0 | 45091.1 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.500 |

Ragas metrics were not requested and are unavailable.

### Per-question evidence

- `placeholder-q001`: direct RAG had no retrieved chunks and no citations.
  Supervisor routing selected `knowledge` correctly, but had no citations or
  relevant chunks.
- `placeholder-q002`: direct RAG returned an answer with no citations and no
  route applicability. The supervisor selected `learning` but the expected
  knowledge route was not matched and the agent returned a generic failure
  answer.

The supervisor mean latency was 14,416.7 ms higher in the aggregate. These
two observations include a 95 ms proposed-system result and a 90,086 ms
retry/timeout-like result, so the mean is not a stable quality or
performance estimate.

## 8. Statistical analysis

There are too few rows, and the data are placeholder rows rather than a
human-reviewed university sample. No confidence intervals, significance tests,
effect sizes, or generalization claims are appropriate.

At the aggregate descriptive level:

- supervisor mean routing accuracy: 0.500;
- direct RAG routing accuracy: not applicable;
- all retrieval/citation/operational metrics: 0.000;
- no failures counted as runner exceptions, despite evidence and route failures;
- no Ragas measurements.

Future analysis should report paired differences, bootstrap confidence intervals,
per-agent strata, latency distributions, and a preregistered significance
criterion on a sufficient human-reviewed dataset.

## 9. Limitations

- The source corpus and relevant chunk IDs are placeholders.
- Reviewer identity is not academic and `urn:placeholder` values are not
  approved sources.
- The result run did not demonstrate real document retrieval or citations.
- Ragas was disabled.
- Token and cost fields are unavailable.
- The no-exception condition does not imply factual success.
- The 2-row run cannot support system recommendations.
- Local CPU performance is hardware-specific and should not be extrapolated.

## 10. Discussion

The observed output demonstrates only that the pipeline can execute and emit
both direct-RAG and supervisor runs, including route and run metadata. It does
not demonstrate that the supervisor is more accurate or that either system
answers academic questions correctly.

The current source, routing, and fallback behavior is testable and implemented;
the empirical quality layer is pending approved corpus data and human review.

## 11. Required completion plan

Before defense-quality reporting:

1. replace placeholder questions with 50–100 approved, reviewed questions;
2. index an isolated evaluation corpus;
3. populate real chunk IDs and citation allowlists;
4. run the paired experiment alternately and serially;
5. enable Ragas only with a justified judge configuration;
6. preserve raw JSONL, CSV, summaries, report, and dataset version;
7. perform paired statistical and error analysis;
8. independently reviewer-check a sampled answer subset.
