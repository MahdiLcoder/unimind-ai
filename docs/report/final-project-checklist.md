# Final project quality checklist

Mark completed only from observed evidence.

## Application startup

- [ ] `docker compose up --build` completes in target environment
- [ ] PostgreSQL, Redis, Ollama, API, web, code runner, and sandbox image healthy
- [ ] `/health/live` returns success
- [ ] `/health/ready` shows PostgreSQL and Redis ready
- [ ] API `/docs` is reachable
- [ ] Frontend loads in supported browser

Verified in this workspace: Docker startup was not executed as a full live
stack; see remaining environment checks.

## Authentication

- [ ] Clerk sign-in/sign-up works
- [ ] API rejects missing/invalid bearer tokens
- [ ] JWT issuer, JWKS, authorized party, and expiry are validated
- [ ] New user defaults to student
- [ ] Administrator bootstrap works
- [ ] Self-demotion/final-administrator deletion protections work

Verified by repository/tests: implementation exists and relevant unit tests
exist; live Clerk configuration is environment-dependent.

## Core modules

- [ ] Courses/workspaces
- [ ] Enrollments
- [ ] Tasks/submissions
- [ ] Study plans
- [ ] Lessons
- [ ] Quizzes/mock exams
- [ ] Research/search/saved papers
- [ ] Dashboard/notifications
- [ ] Administration

## Agent execution

- [ ] Supervisor route works
- [ ] Single-agent request works
- [ ] Parallel fan-out works
- [ ] Dependency batch works
- [ ] Timeout works
- [ ] One bounded retry works
- [ ] Agent run is persisted
- [ ] Agent steps/timeline are persisted
- [ ] Stream ends in a final response or failure state

Verified: route/workflow unit coverage exists.

## RAG citations

- [ ] Real approved PDF upload works
- [ ] PDF text and page metadata extract
- [ ] Embeddings index with configured model
- [ ] Owner/course filters block unauthorized data
- [ ] Retrieval returns relevant chunks
- [ ] Generation returns citation labels
- [ ] Citation labels match reviewed allowlist
- [ ] No-evidence answer fails safely
- [ ] Unsupported MIME/size/PDF behavior is clear

Verified: parser/RAG unit tests and one pgvector integration test exist;
real model/PDF behavior remains live-dependent.

## Database persistence

- [ ] Alembic upgrade from clean database succeeds
- [ ] Document/chunk deletion cascades
- [ ] Conversation/message/agent run persists
- [ ] Courses, tasks, quizzes, and plans persist
- [ ] Search history and saved research persist
- [ ] Audit records persist

## Security

- [ ] JWT and roles tested
- [ ] Document owner/course scopes tested
- [ ] Browser cannot inject roles/course access
- [ ] Upload limits and signatures tested
- [ ] Rate limiting tested
- [ ] RAG text is treated as untrusted
- [ ] Code runner network and filesystem controls tested
- [ ] Docker daemon exposure reviewed

## Automated tests

- [x] Backend: 128 passed, 1 skipped
- [x] Frontend: 16 Vitest tests passed
- [x] Frontend ESLint passed
- [x] Frontend TypeScript passed
- [ ] PostgreSQL integration live pass with configured URL
- [ ] Playwright E2E pass in target browser environment
- [ ] Docker full-stack health pass
- [ ] Real model inference pass

## Deployment

- [ ] Compose startup/stop and named volumes
- [ ] Kubernetes manifest review
- [ ] Kubernetes live deployment
- [ ] Registry packaging
- [ ] Production secrets and trusted proxy
- [ ] Backup/restore procedure
- [ ] Resource limits
- [ ] Monitoring dashboards and alerts

## Monitoring

- [ ] Health/readiness metrics
- [ ] Prometheus scrape verified
- [ ] Grafana dashboards verified
- [ ] Agent latency/failure alerts
- [ ] RAG retrieval/error alerts
- [ ] Database/Redis alerts
- [ ] Log retention and access review

## Documentation consistency

- [x] Technical report
- [x] Mermaid architecture diagrams
- [x] API reference
- [x] Experimental report
- [x] Student/professor/administrator guides
- [x] Installation/developer/troubleshooting guides
- [x] Presentation outline
- [x] Demonstration script
- [x] Final checklist
- [ ] Live demo URLs and credentials documented outside source control
- [ ] Screenshots updated after final UI changes
