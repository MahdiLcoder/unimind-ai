# Testing, evaluation, and security status

This document separates automated checks from experiments. A passing test suite
does not establish model quality, production security, or live-service health.
Only measurements produced by a completed run against the named dataset and
configuration belong in a results report.

## Reproduction commands

From the repository root, with Docker services and project dependencies
available:

```bash
pnpm install --frozen-lockfile
pnpm check
cd services/ai-api
uv sync --frozen
uv run ruff check . ../../ai
uv run pytest -q
```

The default Python suite uses fakes for model and API boundaries. Set
`RAG_TEST_DATABASE_URL` to a disposable PostgreSQL database with pgvector to
include the database integration test. Run `docker compose up --build` for
service-level health and live model checks; these are separate from unit tests.
Coverage includes token validation, role checks, document ownership/course
scoping, upload validation, API errors, agent routing/retries/parallel work/
checkpoint state, and RAG metrics. The routing contract, paired experiment,
and rate-limit tests are in `services/ai-api/tests/`.

## Security and reliability controls

- Clerk JWT verification checks signature, issuer, expiry, and authorized party;
  API roles come from server-side records.
- Document retrieval and deletion use authenticated owner or database-derived
  course access. Upload parsing checks size, extension, MIME, and file content.
- Retrieved text is escaped and isolated as untrusted context. Injection phrase
  detection is defense in depth, not a complete prompt-injection defense.
- Agent calls have a configured timeout and bounded retry. Administrative
  changes and agent events are persisted for audit.
- The coding runner is a separate network-disabled container with resource
  limits. Its Docker daemon access is powerful host authority and deployment
  isolation remains an operational requirement.
- Readiness checks PostgreSQL and Redis. Database mutations use SQLAlchemy
  transactions at route/service boundaries.
- Redis-backed API limiting uses atomic fixed-window counters for `/api/v1/*`.
  It is enabled by default when `APP_ENV=production`; Compose enables it unless
  `API_RATE_LIMIT_ENABLED=false` is set. Defaults are 120 requests per minute
  per remote address and API route group. Redis failures return HTTP 503 rather
  than silently disabling protection. Behind a proxy, ensure Uvicorn receives
  the trusted proxy's client address; browser forwarding headers are ignored.

## Paired benchmark runner

`ai.evaluation.rag.RAGEvaluator` computes Recall@K, Precision@K, MRR, gold-hit
retrieval score, citation-label validity, and caller-supplied latency. The paired
runner in `services/ai-api/scripts/run_paired_evaluation.py` runs direct RAG and
the LangGraph supervisor against each identical question, alternates system
order, uses the same configured model/retriever, and records per-question
failures. It produces JSONL, CSV, aggregate JSON, SVG charts, and a Markdown
report. Token and cost fields remain null if the provider does not expose usage
or there is no applicable price card.

Operational success means a non-empty answer without a run error, all cited
labels are in the reviewed allowlist, and the supervisor's selected agents
exactly match the reviewed route. This is not a factuality score. Optional
Ragas measurements include context precision/recall, faithfulness, answer
relevancy, and factual correctness, judged with the configured local Ollama
model. Ragas scores are estimates and should be interpreted with reviewer
labels.

Install optional Ragas and CPU inference dependencies after the core sync:

```bash
cd services/ai-api
uv sync --frozen --group inference --group evaluation
```

After preparing the reviewed dataset and indexing its cited source documents
under the evaluation identity, run from `services/ai-api`:

```bash
PYTHONPATH=../..:. uv run python scripts/run_paired_evaluation.py \
  --dataset ../../docs/evaluation/academic_questions.jsonl \
  --output /tmp/unimind-phase6-results.jsonl --ragas
```

Set `EVAL_USER_ID` and `EVAL_ALLOWED_COURSE_IDS` to a dedicated evaluation
identity and permitted courses. Never accept course IDs from an untrusted
benchmark row. The runner uses the configured database, Ollama service, and
Hugging Face embedding model. `--ragas` adds five LLM-judge metrics per system
and question, so local CPU inference may take substantial time.

## Dataset and results status

No manually verified 50–100 question academic dataset is checked in, and no
paired experiment has been run. The repository does not include an approved
university source corpus plus human-reviewed question, answer, relevant-chunk,
route, and citation labels. The JSONL row contract is in
[academic-question.schema.json](evaluation/academic-question.schema.json); the
loader rejects fewer than 50 rows, invalid reviewer/source fields, duplicate
IDs, or mixed dataset versions. There are no answer-quality, routing, Ragas,
latency, token, cost, or failure-rate results to report yet.

Before presenting results, reviewers must prepare 50–100 questions from
authorized university material and record the reference answer, relevant chunk
IDs, expected route, valid citation strings, reviewer, timestamp, and source
references. Freeze one dataset version, use an isolated evaluation identity,
and keep per-question outputs with the report. Do not label generated questions
as manually verified.

## Browser end-to-end test setup

Playwright 1.65.1 is installed as a dev dependency in `apps/web`. The config is
at `apps/web/playwright.config.ts`. Four specs cover the landing page and auth
route guards. The binary is available at
`apps/web/node_modules/.bin/playwright`.

**Running the browser tests requires:**

1. A running Next.js server pointed to by `PLAYWRIGHT_TEST_BASE_URL`
   (default: `http://localhost:3001`).
2. A browser. Two options:
   - **System Chrome (recommended locally):** Set `PLAYWRIGHT_CHANNEL=chrome`
     in `.env` or as an environment variable. Playwright will use the installed
     `google-chrome` binary — no download needed. This environment has Chrome
     at `/usr/bin/google-chrome`.
   - **Playwright Chromium:** Requires network access to download via
     `cd apps/web && pnpm exec playwright install chromium`. Download from
     `cdn.playwright.dev` fails in sandboxed/air-gapped environments.

Exact blocker in the sandbox: `EAI_AGAIN cdn.playwright.dev` — DNS is
unavailable. System Chrome is present but sandboxed execution may prevent
running it. In a standard development environment with network access:

```bash
# Option A: use system Chrome (no download)
PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_TEST_BASE_URL=http://localhost:3001 \
  pnpm --filter web test:e2e

# Option B: download Playwright Chromium first (requires network)
cd apps/web && pnpm exec playwright install chromium
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3001 pnpm --filter web test:e2e
```

The E2E tests do not run as part of `pnpm check` (which runs only vitest unit
tests). They are opt-in via `pnpm test:e2e`.

## Trusted proxy and client IP configuration

The rate limiter reads `request.client.host`, which Uvicorn populates from the
TCP connection. When the application runs behind a reverse proxy (nginx, Caddy,
Traefik, AWS ALB), the TCP peer is the proxy, not the real client.

To forward the real client IP to Uvicorn, start with:

```bash
uvicorn app.main:app --forwarded-allow-ips="<proxy-cidr>"
```

or in `docker-compose.yml` add `--forwarded-allow-ips=*` only if the container
is not reachable except through a trusted proxy. `*` trusts any peer; restrict
to specific CIDR blocks in production. The rate-limit key is a SHA-256 digest
of the client address so raw IPs are not stored in Redis.

Do **not** read `X-Forwarded-For` or `X-Real-IP` headers in application code;
Uvicorn's `--forwarded-allow-ips` is the correct mechanism.

The Docker Compose stack does not currently set `--forwarded-allow-ips` because
the API container is not behind a proxy in the default compose setup. Add it to
the `command` or `environment` of the `api` service when deploying behind a
reverse proxy.

## Remaining gaps

- A reviewed academic benchmark and actual paired results/error analysis remain
  outstanding until an approved corpus and annotations are available. A
  50-question synthetic placeholder dataset is at
  `docs/evaluation/academic_questions.jsonl`; every row must be replaced by
  human-reviewed questions from authorised university material before reporting
  results.
- Human approval/interrupt flows for sensitive actions are not implemented.
- PostgreSQL/Redis integration and real model checks require reachable services
  and model weights; mocked tests do not validate those external systems.
- Playwright E2E tests require a running Next.js server and a browser. In
  air-gapped sandboxes the browser download is blocked (EAI_AGAIN). Set
  `PLAYWRIGHT_CHANNEL=chrome` to use an installed system Chrome instead.

These gaps are recorded rather than represented as completed features or
successful experiments.
