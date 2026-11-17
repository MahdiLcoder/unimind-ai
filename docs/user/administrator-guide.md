# Administrator user guide

## Access

Administrator permissions require the local server-side `administrator` role.
Initial administrator IDs can be configured with `ADMIN_CLERK_USER_IDS` before
the first sign-in. Role changes are administrator-only.

## Administration

The `/admin` interface and `/api/v1/admin` routes support:

- user role management;
- workspace management;
- allowlisted feature flags;
- audit log review;
- agent run review;
- dashboard/platform summaries.

The API prevents self-demotion and removal of the final administrator.

## Operational checks

- verify `/health/live`;
- verify `/health/ready`;
- confirm PostgreSQL and Redis are healthy;
- confirm Ollama and the selected model are available when agent inference is
  required;
- confirm the code runner if coding execution is enabled;
- review agent-run and audit records after failures.

## Security responsibilities

- configure Clerk keys, issuer, JWKS, and authorized parties consistently;
- keep database, Redis, and Clerk secrets out of source control;
- use a dedicated or rootless Docker host for the code runner;
- do not expose the code runner or Docker daemon;
- restrict network and production proxy configuration;
- ensure course and document permissions are reviewed.
