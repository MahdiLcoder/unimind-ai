# UniMind AI

UniMind AI is a university assistant project. It provides a Next.js 16 frontend,
a FastAPI service, PostgreSQL with pgvector, Redis, and a reusable multilingual
RAG library. The application adds a collaborative multi-agent layer with
seven specialized agents, bounded retries, dependency-aware routing, and
persistent user memory for learning preferences and progress.

## Architecture

- `apps/web`: Next.js App Router, TypeScript, Tailwind CSS 4, shadcn/ui
- `services/ai-api`: FastAPI, Pydantic settings, async SQLAlchemy, Alembic
- `ai/rag`, `ai/models`, `ai/evaluation`: reusable retrieval, model-provider,
  and evaluation interfaces
- `ai/agents`, `ai/graphs`, `ai/tools`, `ai/prompts`, `ai/state`: multi-agent
  workflows, prompts, tools, and state
- `infrastructure`: Docker, Kubernetes, monitoring, and scripts
- `docs`: architecture and development documentation
- PostgreSQL 17 with the pgvector extension; Redis with AOF persistence

See [the architecture overview](docs/architecture/overview.md) for service
boundaries and health checks.

## Prerequisites

- Docker Engine and Docker Compose
- Node.js 22+ and pnpm 10+
- Python 3.11+ and uv

The default API installation does not download model weights or start inference.
Hugging Face inference is an optional CPU-only dependency group, and models load
lazily one at a time. Ollama generation is configured separately.

## Run the full stack

From the repository root:

```bash
cp .env.example .env
docker compose up --build
```

Services:

- Frontend: <http://localhost:3000>
- API docs: <http://localhost:8000/docs>
- Liveness: <http://localhost:8000/health/live>
- Dependency readiness: <http://localhost:8000/health/ready>

The stack includes PostgreSQL, Redis, FastAPI, an internal code runner, and
Next.js, plus a private CPU-only Ollama service. On first startup, a one-shot
service pulls the configured `OLLAMA_MODEL` (default `qwen2.5:3b`) into the
persistent `ollama_data` volume; the model endpoint is not published to the
host. The API waits for that pull to finish before starting. Compose builds a
minimal Python execution image in a one-shot service.
Agent execution has a configurable `AGENT_EXECUTION_TIMEOUT_SECONDS` limit
(120 seconds by default to accommodate local CPU inference).
For PDF embedding and semantic search, set `INSTALL_HF_INFERENCE=true` before
building the API image. Hugging Face model files are cached in the persistent
`hf_model_cache` volume. Set `HF_RERANKER_ENABLED=false` to skip the optional
reranker and its additional model download.
The API waits for healthy Postgres, Redis, and runner services, applies Alembic
migrations (including enabling pgvector), then starts FastAPI. The readiness
endpoint returns HTTP 503 unless Postgres and Redis are reachable. Stop with
`docker compose down`; named volumes retain database and Redis data.
The host ports default to `5432` and `6379`; set `POSTGRES_HOST_PORT` and
`REDIS_HOST_PORT` in `.env` if those ports are already in use. The frontend
host port defaults to `3000`; if it is occupied, set `WEB_HOST_PORT` and update
`FRONTEND_URL`, `CORS_ORIGINS`, and `CLERK_AUTHORIZED_PARTIES` in `.env` to
include the frontend origin.

## Run services locally

Install the JavaScript workspace and copy environment defaults:

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Start Postgres and Redis in a separate terminal with
`docker compose up -d postgres redis`. In another terminal:

```bash
cd services/ai-api
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The root `.env` is loaded by the API settings and by `pnpm dev`; `NEXT_PUBLIC_API_URL`
must point to an address reachable by the browser (the default is
`http://localhost:8000`). Never commit `.env` or use the example development
password outside a local machine.

## Clerk authentication and roles

Create a Clerk application and configure these values in the root `.env`:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (or `CLERK_PUBLISHABLE_KEY`, as emitted
  by the Clerk CLI) and `CLERK_SECRET_KEY` from the Clerk application.
- `CLERK_ISSUER` and `CLERK_JWKS_URL` from that application's JWT/JWKS
  configuration.
- `CLERK_AUTHORIZED_PARTIES` as a comma-separated list of trusted frontend
  origins (locally, `http://localhost:3000`).

The frontend keys, issuer, and JWKS URL must all belong to the same Clerk
instance. Clerk development keys are suitable for local testing, but not for
production deployments.

The Next.js app provides `/sign-in`, `/sign-up`, and protected dashboard,
workspace, course, learning, research, coding, and administration pages.
FastAPI validates the bearer token signature, issuer, expiration, and
authorized party before provisioning or resolving a local `users` record.
Roles are stored server-side as `student`, `professor`, or `administrator`;
new users default to `student`. To bootstrap initial administrators, set
`ADMIN_CLERK_USER_IDS` to a comma-separated list of Clerk user IDs before those
users first sign in. Administrators can list users and update roles through
`GET /api/v1/users` and `PATCH /api/v1/users/{clerk_user_id}/role`. The API does
not accept role claims or course permissions from browser input.

The Clerk provider can display development keyless setup if no frontend key is
configured. API-authenticated features require the issuer, JWKS URL, and
authorized-party settings; protected API requests fail closed until these are
configured. Password recovery and MFA are managed by Clerk.

## Quality checks

The current test and evaluation coverage, reproducible commands, measured
results status, and known Phase 6 gaps are recorded in
[Testing, evaluation, and security](docs/testing-evaluation-security.md).

To run the paired direct-RAG/supervisor experiment after preparing and
reviewing its academic question set, see the runbook for installing the
optional Ragas evaluation dependencies and producing per-question JSONL/CSV,
aggregate JSON, charts, and a Markdown report.

```bash
pnpm install --frozen-lockfile
pnpm check
cd services/ai-api
uv sync --frozen
uv run ruff check . ../../ai
uv run pytest
```

For the full Docker health check, use `docker compose up --build -d`, then
`docker compose ps`; all five long-running services should report healthy
(the sandbox-image service exits successfully after building its image). Verify the
extension with:

```bash
docker compose exec postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT extversion FROM pg_extension WHERE extname = '\''vector'\'';"'
```

## Optional Hugging Face inference

The default install supports parsing, persistence, retrieval interfaces, and
Hugging Face Hub metadata inspection without importing PyTorch. To enable local
embeddings and reranking:

```bash
cd services/ai-api
uv sync --frozen --group inference
```

This installs CPU PyTorch only. BGE-M3 and the reranker download weights on
first use; no model is downloaded during setup. Configure model IDs and the
CPU batch size with `HF_EMBEDDING_MODEL`, `HF_EMBEDDING_DIMENSIONS`,
`HF_RERANKER_MODEL`, `HF_DEVICE`, and `HF_BATCH_SIZE`. Use a reachable Ollama
instance for generation (`OLLAMA_BASE_URL` and `OLLAMA_MODEL`).

Authenticated private-document endpoints are available at
`POST/GET /api/v1/documents`, `DELETE /api/v1/documents/{document_id}`, and
`POST /api/v1/documents/search`. The protected `/workspace` page combines
upload, library management, semantic search, and the existing multi-agent chat
stream with citations. Documents are scoped to the verified Clerk user.
Course-specific access is derived from professor ownership, active student
enrollment, or administrator access; browser-supplied course scopes are never
trusted. The Python RAG service accepts trusted `owner_id` and
`allowed_course_ids`. See
[RAG architecture and usage](docs/architecture/rag.md).

## Academic application modules

The authenticated application includes workspace and course management,
student enrollment, professor course assignments and quizzes, task tracking,
AI-generated quizzes and capacity-bounded study plans, Crossref paper search
and a per-user saved bibliography, and a Coding Agent interface for tutoring,
generation, review, debugging, and challenge feedback. `CROSSREF_MAILTO` is an
optional contact address for polite Crossref API usage. Role changes are
administrator-only; self-demotion and removal of the final administrator are
rejected.

The Learning Studio also persists AI-generated lessons per user. Its current
learning API behavior and persistence boundaries are documented in
[Learning and planning API](docs/api/learning.md); flashcard generation remains
session-only.
Crossref searches are retained as per-user history, and selected saved papers
can be compared from their saved metadata and abstracts. See
[Research API](docs/api/research.md) for the routes and evidence limitations.
The dashboard also allows users to edit app-owned academic profile fields;
Clerk remains responsible for authentication and email. See
[User profile API](docs/api/users.md).

The Coding Agent can execute Python in a short-lived container with no network,
read-only root filesystem, a non-root identity, and CPU, memory, process,
time, and output limits; only the standard library is available. The runner
needs access to a Docker Engine socket, which is effectively host-root
authority. Use a dedicated, preferably rootless Docker host for untrusted
submissions; do not expose the runner or share that daemon with sensitive
workloads. The dashboard provides task, course, quiz,
deadline, and agent-run summaries with persistent in-app notifications.
Professors can review course learning activity; administrators can manage
workspaces, allowlisted feature flags, and audit records. Notifications are
in-app only (no push delivery). Quiz generation validates the requested item
count and requires four non-empty, distinct choices with the answer among
them; invalid model output returns an upstream error and is not saved.

Local verification has confirmed student sign-in and access to the profile,
dashboard, and notifications, with student access to administrator endpoints
denied. This used Clerk development keys. A real Qwen 2.5 3B streaming request
and a PDF upload, indexing, semantic search, and cited chat answer have also
been exercised. Live component checks also confirmed Crossref metadata lookup,
one quiz output with four distinct choices, a generated three-task study plan
that fit the supplied daily capacity, and a harmless code snippet returning
`42` through the isolated runner. A separate quiz generation returned invalid
choices and was rejected by validation. These component checks do not
establish production Clerk authentication or a complete student, professor,
and administrator workflow. Professor and administrator end-to-end flows,
authenticated quiz submission and study-plan save flows, and security of a
production code runner remain to be verified against the configured stack.

## Branch and commit conventions

Use `main` for stable releases and `develop` for integration. Create focused
branches from `develop` using `feat/<topic>`, `fix/<topic>`,
`docs/<topic>`, or `chore/<topic>`. Write commits in the
Conventional Commits format (for example `feat(api): add readiness checks`).
