# Foundation architecture

```text
Browser ──HTTP──> Next.js (apps/web) ──HTTP/CORS──> FastAPI (services/ai-api)
                                                      ├── async SQLAlchemy ──> PostgreSQL 17 + pgvector
                                                      └── redis-py ──────────> Redis (AOF persistence)
```

Docker Compose at the repository root runs all four services. The API starts
after database and cache health checks pass, applies Alembic migrations, and
then serves requests. PostgreSQL data and Redis append-only files use named
volumes.

## API health

- `GET /health/live` is a liveness probe and does not depend on external
  services.
- `GET /health` remains available for compatibility with the original API
  health endpoint.
- `GET /health/ready` runs `SELECT 1` and a Redis `PING`. It returns `200` with
  per-dependency status when both checks pass, otherwise `503`.
- `GET /api/v1/test` is a small integration endpoint used by the frontend
  connection page.

The API reads database, Redis, and CORS settings from environment variables.
The checked-in `.env.example` contains local-only defaults; actual `.env` files
are ignored by Git. Add schema changes as Alembic revisions under
`services/ai-api/migrations/versions`.

The `ai/` subdirectories are structural namespaces only in this phase. No
agents, model downloads, or inference services are started.
