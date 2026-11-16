# Paired UniMind AI Evaluation

- Run time (UTC): `2026-11-16T19:45:22.938517+00:00`
- Questions: 2
- Dataset version: `placeholder-v0`
- Generation model: `qwen2.5:3b`
- Embedding model: `BAAI/bge-m3`
- Ragas enabled: `False`
- Pairing: same reviewed question, sequential runs, same configured model and retrieval system.
- Routing accuracy is not applicable to the direct-RAG baseline.
- Operational success requires a completed non-empty answer, all cited labels in the reviewed allowlist, and an exact expected route when routing applies. It is not a factuality score.
- Failures are retained as per-question failure types; token and cost values remain null when providers do not expose usage or pricing.

| System | Failures | Mean latency ms | Recall@5 | Precision@5 | MRR | Citation correctness | Operational success | Routing accuracy | Input tokens | Output tokens | Estimated cost USD |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Direct RAG | 0 | 30674.4 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | N/A | N/A | N/A | N/A |
| LangGraph Supervisor | 0 | 45091.1 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.500 | N/A | N/A | N/A |

## Ragas metrics

| System | Context precision | Context recall | Faithfulness | Answer relevancy | Factual correctness |
|---|---:|---:|---:|---:|---:|
| Direct RAG | N/A | N/A | N/A | N/A | N/A |
| LangGraph Supervisor | N/A | N/A | N/A | N/A | N/A |

## Error analysis

- `placeholder-q001`: routing or citation labels did not fully match reviewer labels.
- `placeholder-q002`: routing or citation labels did not fully match reviewer labels.
## Limits

Quality metrics from Ragas are separate per-question measurements when `--ragas` is enabled. They are LLM-judge estimates and should be interpreted alongside the reviewer labels. This report does not claim statistical significance.
