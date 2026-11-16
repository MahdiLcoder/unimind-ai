# UniMind AI

UniMind AI is a university assistant project. This foundation provides a
Next.js 16 frontend, a FastAPI service, PostgreSQL with pgvector, and Redis.
AI-agent functionality is intentionally out of scope for this phase.

## Architecture

- `apps/web`: Next.js App Router, TypeScript, Tailwind CSS 4, shadcn/ui
- `services/ai-api`: FastAPI, Pydantic settings, async SQLAlchemy, Alembic
- `ai/agents`, `ai/graphs`, `ai/rag`, `ai/models`, `ai/tools`, `ai/prompts`,
  `ai/state`, `ai/evaluation`: reserved for later AI milestones
- `infrastructure`: Docker, Kubernetes, monitoring, and scripts
- `docs`: architecture and development documentation
- PostgreSQL 17 with the pgvector extension; Redis with AOF persistence

See [the architecture overview](docs/architecture/overview.md) for service
boundaries and health checks.

## Prerequisites

- Docker Engine and Docker Compose
- Node.js 22+ and pnpm 10+
- Python 3.11+ and uv

The project has been structured to avoid downloading or starting local AI models
during foundation setup.

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

The API container waits for healthy Postgres and Redis, applies Alembic
migrations (including enabling pgvector), then starts FastAPI. The readiness
endpoint returns HTTP 503 unless both dependencies are reachable. Stop with
`docker compose down`; named volumes retain database and Redis data.
The host ports default to `5432` and `6379`; set `POSTGRES_HOST_PORT` and
`REDIS_HOST_PORT` in `.env` if those ports are already in use.

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

## Quality checks

```bash
pnpm install --frozen-lockfile
pnpm check
cd services/ai-api
uv sync --frozen
uv run ruff check .
uv run pytest
```

For the full Docker health check, use `docker compose up --build -d`, then
`docker compose ps`; all four services should report healthy. Verify the
extension with:

```bash
docker compose exec postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT extversion FROM pg_extension WHERE extname = '\''vector'\'';"'
```

## Branch and commit conventions

Use `main` for stable releases and `develop` for integration. Create focused
branches from `develop` using `feat/<topic>`, `fix/<topic>`,
`docs/<topic>`, or `chore/<topic>`. Write commits in the
Conventional Commits format (for example `feat(api): add readiness checks`).
