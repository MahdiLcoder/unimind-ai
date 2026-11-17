# Installation guide

## Requirements

- Docker Engine and Docker Compose;
- Node.js 22+ and pnpm 10+ for local frontend development;
- Python 3.11+ and `uv`;
- a Clerk application for authentication;
- CPU-oriented hardware; no dedicated GPU required.

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Local addresses:

- frontend: `http://localhost:3000`;
- API: `http://localhost:8000`;
- OpenAPI: `http://localhost:8000/docs`;
- liveness: `http://localhost:8000/health/live`;
- readiness: `http://localhost:8000/health/ready`.

Compose pulls/configures Ollama model `qwen2.5:3b` by default. The API does not
start until its database, Redis, Ollama model, and code runner dependencies are
ready. Hugging Face model weights are not downloaded unless inference is enabled
and the model is first used.

Stop:

```bash
docker compose down
```

Named volumes retain PostgreSQL, Redis, Ollama, and Hugging Face data.

## Local services

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis

cd services/ai-api
uv sync --frozen
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

In another terminal:

```bash
pnpm dev
```

Configure `NEXT_PUBLIC_API_URL` and Clerk keys consistently. Never commit `.env`
or production secrets.
