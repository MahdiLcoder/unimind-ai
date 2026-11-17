FROM python:3.12-slim AS dependencies

COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /build

COPY services/ai-api/pyproject.toml services/ai-api/uv.lock ./
ARG INSTALL_HF_INFERENCE=false
RUN if [ "$INSTALL_HF_INFERENCE" = "true" ]; then \
      uv sync --frozen --no-dev --no-install-project --group inference; \
    else \
      uv sync --frozen --no-dev --no-install-project; \
    fi

FROM python:3.12-slim AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    HOME=/home/app \
    HF_HOME=/home/app/.cache/huggingface \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --create-home --home-dir /home/app app \
    && mkdir -p /home/app/.cache/huggingface \
    && chown -R app:app /home/app

COPY --from=dependencies /opt/venv /opt/venv
COPY --chown=app:app services/ai-api/alembic.ini ./
COPY --chown=app:app services/ai-api/app ./app
COPY --chown=app:app services/ai-api/migrations ./migrations
COPY --chown=app:app ai ./ai

USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
