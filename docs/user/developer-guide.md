# Developer guide

## Repository layout

- `apps/web`: Next.js frontend;
- `services/ai-api`: FastAPI, SQLAlchemy, migrations, API tests;
- `ai`: agents, graphs, RAG, model providers, evaluation;
- `infrastructure`: Docker/Kubernetes/monitoring/scripts;
- `docs`: architecture, API, evaluation, report, and user documents.

## Quality commands

```bash
pnpm install --frozen-lockfile
pnpm check

cd services/ai-api
uv sync --frozen
uv run ruff check . ../../ai
uv run pytest -q
```

Optional PostgreSQL RAG integration:

```bash
RAG_TEST_DATABASE_URL=postgresql+asyncpg://... \
  uv run pytest -q tests/test_rag_postgres_integration.py
```

Optional browser tests require a running web server and a browser:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 \
PLAYWRIGHT_CHANNEL=chrome \
pnpm --filter web test:e2e
```

## Database migrations

```bash
cd services/ai-api
uv run alembic upgrade head
uv run alembic revision -m "describe change"
```

Add migrations for schema changes and include upgrade/downgrade logic.

## API development

- place HTTP route boundaries in `app/api`;
- place persistence models in `app/models`;
- use Pydantic settings and response models;
- derive identity and role through `app/api/auth.py`;
- do not accept browser-provided owner, role, or course scope;
- use transactions and explicit errors.

## Agent development

- keep agent implementation types in `ai/agents`;
- keep LangGraph state and transitions in `ai/graphs`;
- add routing decisions in `ai/agents/routing.py`;
- retain bounded retries and timeout behavior;
- persist timeline events through the API agent service.

## RAG development

- validate input in `ai/rag/ingestion.py`;
- preserve owner/course/document metadata;
- filter repository searches by trusted principal values;
- treat retrieved text as untrusted context;
- validate citation labels before returning an answer;
- change embedding dimensions only with a migration/reindex plan.
