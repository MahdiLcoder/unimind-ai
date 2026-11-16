FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

COPY services/ai-api/pyproject.toml services/ai-api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY services/ai-api/alembic.ini ./
COPY services/ai-api/app ./app
COPY services/ai-api/migrations ./migrations
COPY ai ./ai

EXPOSE 8000

CMD ["sh", "-c", "uv run --no-sync alembic upgrade head && exec uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port 8000"]
