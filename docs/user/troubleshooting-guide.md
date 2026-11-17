# Troubleshooting guide

## API says identity provider is unavailable

Check `CLERK_JWKS_URL`, `CLERK_ISSUER`, and `CLERK_AUTHORIZED_PARTIES`.
Confirm frontend and API keys belong to the same Clerk application.

## API readiness is 503

Check PostgreSQL and Redis:

```bash
docker compose ps
docker compose logs postgres redis ai-api
curl http://localhost:8000/health/ready
```

## Frontend cannot reach API

Confirm `NEXT_PUBLIC_API_URL` is browser-reachable and `CORS_ORIGINS` includes
the frontend origin.

## Document upload is 422

Confirm a supported extension and MIME signature, non-empty extracted text,
readable PDF, and a valid course scope. Scanned PDFs without OCR text are
rejected.

## Search or generation is 503

Confirm optional inference dependencies, Hugging Face model availability, and
the Ollama endpoint/model. Installation does not download model weights.

## Agent run fails or retries

Review `agent_runs`/`agent_steps`, API logs, and timeout
`AGENT_EXECUTION_TIMEOUT_SECONDS`. Check that the relevant Ollama model is
pulled and the CPU host has enough memory.

## Code execution unavailable

Check code-runner and sandbox-image health:

```bash
docker compose ps code-runner sandbox-image
docker compose logs code-runner sandbox-image
```

Confirm Docker socket access is isolated to a dedicated host. Do not expose the
runner or daemon to untrusted networks.

## E2E tests fail or browser is missing

Start Next.js and use an installed system Chrome:

```bash
PLAYWRIGHT_CHANNEL=chrome \
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 \
pnpm --filter web test:e2e
```

Playwright Chromium download requires network access; do not assume it passed
in an air-gapped environment.
