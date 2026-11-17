# UniMind AI deployment and operations

## Deployment status and prerequisites

This repository contains reproducible deployment configurations; no cloud
account, GHCR credentials, Kubernetes cluster, DNS zone, or production secrets
are available in the repository workspace. Publishing images or claiming a
live deployment requires those external resources and is not performed by local
validation.

Production Compose requires Docker Engine and Docker Compose v2.26 or newer.
Kubernetes deployment requires a supported cluster, a default persistent
storage class, an ingress controller, a TLS secret, metrics-server for HPA,
and a CNI that enforces NetworkPolicy. The provided PostgreSQL and Redis
StatefulSets are single-instance and persistent, not highly available; use
managed database/cache services or a separately engineered HA configuration
for availability-critical deployments.

No separate AI worker or queue is configured: current agent graphs execute
synchronously in the API and persist workflow state in PostgreSQL. Redis is
used for rate limiting/cache, not as a job queue. The Docker-socket-backed code
runner remains development-only; mounting a host Docker socket in production
would grant excessive host control. Production code execution needs a dedicated
isolated runtime before enabling that feature.

## Local Compose

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:8000/health/ready
```

PostgreSQL and Redis are persisted in named volumes and are published on host
ports only for local development. Migrations run in the `migrate` one-shot
service. Ollama/model downloading and CPU inference are opt-in:

```bash
docker compose --profile inference up --build -d
```

The application does not require the Ollama model merely to start. Hugging Face
inference is separately opt-in via `INSTALL_HF_INFERENCE=true`; this adds CPU
PyTorch and model downloads on first use and is not part of CI or the default
image.

## Production Docker Compose

The production file consumes commit-tagged GHCR images, does not publish
PostgreSQL or Redis, binds app and Grafana ports to loopback for an external
TLS reverse proxy, and keeps metrics protected by a bearer token. Provision
secrets in a protected environment file (do not commit it):

- `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `REDIS_URL` (URL-encode the password),
  `METRICS_BEARER_TOKEN`, and `GRAFANA_ADMIN_PASSWORD` must be unique strong
  values.
- Set `GHCR_OWNER` and `IMAGE_TAG` to the GHCR owner and immutable image tag
  (`sha-<commit>`).
- Set `CORS_ORIGINS`, `CLERK_AUTHORIZED_PARTIES`, and Clerk issuer/JWKS values
  for the real frontend origin and Clerk instance.
- Set `OLLAMA_BASE_URL` to a model endpoint reachable from the API container.
  `localhost` inside the container is not the Docker host.
- Build the frontend with the correct `NEXT_PUBLIC_API_URL` and public Clerk
  key. These are embedded at build time; changing them only at container
  runtime does not update the browser bundle.
- Set repository variable `INSTALL_HF_INFERENCE=true` when the deployment must
  run local Hugging Face embeddings/reranking; this intentionally builds a much
  larger CPU-only image. The default CI image omits PyTorch and model weights.

Log in to GHCR and start the application:

```bash
docker login ghcr.io
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
curl -fsS http://127.0.0.1:8000/health/ready
```

Configure the reverse proxy to terminate TLS and route the public frontend and
API domains to the loopback ports. Grafana is available at
`http://127.0.0.1:3001`; Prometheus is intentionally not host-published.
PostgreSQL/Redis ports are not host-published. Keep `.env` mode `0600` and
restrict access to the Docker host, since Compose environment values are
available to privileged host users.

## GitHub Actions and GHCR

`.github/workflows/ci-cd.yml` runs for pull requests and pushes to `main`.
It installs locked Python/JavaScript dependencies, runs Ruff, Python tests,
frontend lint/type/tests and build, and validates Alembic upgrades against
PostgreSQL with pgvector. It builds API and web images for pull requests; pushes
SHA-tagged images to GHCR on `main` and also updates `latest`.

The workflow builds:

- `ghcr.io/<owner>/unimind-ai-api:sha-<commit>`
- `ghcr.io/<owner>/unimind-ai-web:sha-<commit>`

To enable Kubernetes CD, set repository variable
`KUBERNETES_DEPLOY_ENABLED=true`, create a GitHub Environment named
`production`, and add its `KUBECONFIG` secret. The cluster must already have
the `unimind-production` namespace secrets, ingress/TLS, storage, and
`ghcr-pull` image-pull secret configured. Set repository variable `NEXT_PUBLIC_API_URL` to the public API origin and
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to the frontend publishable key before the
image build. Set `INSTALL_HF_INFERENCE=true` if local embedding/reranking
support is required. Deployment waits for PostgreSQL and Redis, runs the suspended
migration Job, rolls out commit-pinned images, checks Kubernetes rollout
status, and calls the API readiness endpoint.

GitHub environment deployment history records deployments. The manual
`.github/workflows/rollback.yml` workflow can undo the API, web, or both
Deployment rollouts. It does not downgrade database migrations; migrations
must remain backward-compatible with the previous application revision.
Failed-image rollback therefore restores application code only, not database
state.

## Kubernetes

The Kustomize overlays are:

- Development: `infrastructure/kubernetes/overlays/development`
- Production: `infrastructure/kubernetes/overlays/production`

Both use ClusterIP-only PostgreSQL/Redis Services, StatefulSets with PVCs,
API/web Deployments, resource requests/limits, probes, API HPA, Ingress,
Prometheus/Grafana, exporters, and NetworkPolicies restricting data-store
ingress. Replace example hostnames/origins in the overlay/config before
deployment. Production defaults to two API/web replicas; development uses one.
The API requires Kubernetes metrics-server for CPU-based autoscaling.

Development setup uses the `unimind-development` namespace with the same
required `unimind-secrets` keys listed below, a `ghcr-pull` Secret, and a
`unimind-development-tls` certificate. Set origins/hosts in the development
overlay, then render/apply with:

```bash
kubectl create namespace unimind-development --dry-run=client -o yaml | kubectl apply -f -
kubectl kustomize --load-restrictor=LoadRestrictionsNone \
  infrastructure/kubernetes/overlays/development | kubectl apply -f -
```

Create each namespace and its secrets through the cluster's secret-management
process before applying the overlay. Create `unimind-secrets` from a
mode-restricted environment file; do not place secret values directly in
command history:

```bash
kubectl create namespace unimind-production --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic unimind-secrets \
  --from-env-file="$SECURE_ENV_FILE" -n unimind-production
```

The file/Secret must provide
`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `REDIS_URL`, `METRICS_BEARER_TOKEN`,
`CLERK_JWKS_URL`, `CLERK_ISSUER`, `ADMIN_CLERK_USER_IDS`,
`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `GRAFANA_ADMIN_PASSWORD`,
`OLLAMA_BASE_URL`, and `OLLAMA_MODEL`. Even when Clerk authentication is not
configured, include its keys with empty values so the referenced environment
variables resolve.
Use an externally managed secret store for production when available; do not
commit Kubernetes Secret manifests.

For a manual deployment, first edit the `images` entries in
`infrastructure/kubernetes/base/kustomization.yaml` to use your GHCR owner and
the same immutable `sha-<commit>` tag for the API and web images. The automated
workflow performs this owner selection itself.

For private GHCR packages, create `ghcr-pull` from a Docker config authenticated
with a read-only `read:packages` token:

```bash
kubectl create secret generic ghcr-pull \
  --type=kubernetes.io/dockerconfigjson \
  --from-file=.dockerconfigjson="$HOME/.docker/config.json" \
  -n unimind-production
kubectl delete job ai-api-migrate -n unimind-production --ignore-not-found=true
kubectl kustomize --load-restrictor=LoadRestrictionsNone \
  infrastructure/kubernetes/overlays/production | kubectl apply -f -
```

The migration Job is kept suspended until deliberately resumed:

```bash
kubectl rollout status statefulset/postgres -n unimind-production
kubectl rollout status statefulset/redis -n unimind-production
kubectl patch job ai-api-migrate -n unimind-production \
  --type=merge -p '{"spec":{"suspend":false}}'
kubectl wait --for=condition=complete job/ai-api-migrate \
  -n unimind-production --timeout=10m
kubectl set image deployment/ai-api \
  api=ghcr.io/OWNER/unimind-ai-api:sha-COMMIT \
  wait-for-schema=ghcr.io/OWNER/unimind-ai-api:sha-COMMIT \
  -n unimind-production
kubectl set image deployment/web \
  web=ghcr.io/OWNER/unimind-ai-web:sha-COMMIT \
  -n unimind-production
kubectl rollout status deployment/ai-api -n unimind-production
kubectl rollout status deployment/web -n unimind-production
```

Use the production GitHub Actions workflow for routine deployments; it renders
the overlay, starts the migration Job, and pins both application images to the
commit. The relaxed Kustomize load restriction is needed because monitoring
configuration is shared from `infrastructure/monitoring`; the input is the
checked-in repository tree. Grafana is ClusterIP-only; use `kubectl port-forward` for private
administrative access:

```bash
kubectl port-forward service/grafana 3001:3000 -n unimind-production
```

Prometheus loads alert rules, but no Alertmanager destination is configured.
Configure an approved notification receiver before relying on alerts for
incident response.

## Monitoring, logging, and health

Prometheus scrapes bearer-token-protected API metrics plus PostgreSQL and Redis
exporters. Grafana provisions the `UniMind Operations` dashboard with request
rate, p95 API/agent latency, agent failures, API CPU/memory, and database/cache
health. Prometheus rules cover target/database/cache availability, API errors
and latency, and agent failures. No document text, request body, or credentials
are included in metrics.

The API emits JSON logs to stdout with request ID, method, route template,
status and duration. It validates/creates `X-Request-ID` and returns it in the
response; graph agent logs include agent request ID, agent name, outcome, and
duration. Do not add prompt/document content or secrets to log fields. Container
logs and Kubernetes rollout history are available from the runtime:

```bash
docker compose -f docker-compose.production.yml logs --since=1h ai-api
kubectl rollout history deployment/ai-api -n unimind-production
kubectl logs deployment/ai-api -n unimind-production
```

`/health/live` checks process liveness and `/health/ready` checks PostgreSQL
and Redis reachability. Prometheus `/metrics` requires the configured bearer
token and should not be exposed through an unauthenticated public route.

## Backup, restore, and recovery

The PostgreSQL named volume/PVC provides persistence across ordinary container
or pod restarts; it is not a backup. Schedule encrypted off-host backups and
test restoration regularly. The production Compose helper writes a custom
`pg_dump` archive with restrictive local permissions:

```bash
sh infrastructure/scripts/backup-postgres.sh ./backups
```

Restore is destructive to conflicting objects and requires an explicit
confirmation flag:

```bash
sh infrastructure/scripts/restore-postgres.sh \
  ./backups/unimind-postgres-YYYYMMDDTHHMMSSZ.dump --confirm
```

For Kubernetes, stream a custom-format snapshot off the cluster and restore
only during an approved recovery window:

```bash
kubectl exec -n unimind-production statefulset/postgres -- \
  sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > unimind-postgres.dump
kubectl exec -i -n unimind-production statefulset/postgres -- \
  sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < unimind-postgres.dump
```

After a container restart, named volumes preserve PostgreSQL and Redis state;
verify `docker compose ... ps`, `/health/ready`, and `pg_up`/`redis_up` in
Grafana. After a Kubernetes pod restart, StatefulSet PVCs reattach; verify
StatefulSet readiness and API readiness. For a failed application rollout,
run the rollback workflow and verify readiness. Never delete the database PVC
as a recovery shortcut. Redis is persisted with AOF but is treated as
reconstructible cache/rate-limit state; the PostgreSQL dump is the required
durable application backup.
