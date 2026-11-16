FROM python:3.12-alpine AS sandbox

RUN addgroup -S -g 10001 sandbox \
    && adduser -S -D -H -u 10001 -G sandbox sandbox
WORKDIR /workspace
USER 10001:10001

FROM python:3.12-slim AS runner

WORKDIR /app
COPY services/code-runner/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/code-runner/runner.py .

EXPOSE 8081
CMD ["uvicorn", "runner:app", "--host", "0.0.0.0", "--port", "8081"]
