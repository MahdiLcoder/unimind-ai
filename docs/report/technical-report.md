# UniMind AI - Technical Report

**Phase 8 - Documentation and University Defense**

## 1. Executive summary

UniMind AI is an intelligent university assistant combining a Next.js application,
a FastAPI service, PostgreSQL with pgvector, Redis, and a LangGraph multi-agent
layer. Its primary implemented capabilities are authenticated document retrieval,
course-aware RAG, specialist agent routing, learning and planning workflows,
Crossref research, coding assistance, persistent conversations, and
administrator controls.

This report distinguishes verified implementation from planned work. Automated
unit tests, route contracts, and the repository are the evidence base. The
Phase 6 paired benchmark currently contains only a placeholder two-question
run and must not be presented as an academic-quality result.

## 2. Project objectives

### 2.1 Primary objectives

1. Provide grounded answers to university questions with inspectable citations.
2. Coordinate specialist agents for knowledge, learning, research, coding,
   planning, and university-services tasks.
3. Protect private documents and enforce role and course access.
4. Persist courses, enrollment, tasks, study plans, quizzes, conversations,
   research history, and administrative actions.
5. Support CPU-oriented local deployment and bounded inference.
6. Produce reproducible evaluation artifacts and a defensible quality-check
   process.

### 2.2 Scope

Implemented scope includes student, professor, and administrator interfaces;
Clerk authentication; private document upload and retrieval; the agent
execution API and SSE stream; learning and planning persistence; Crossref
search and saved-paper workflows; sandboxed Python execution; and Docker
Compose deployment.

Not implemented or not validated include a production model-quality benchmark,
human approval for every sensitive action, push notifications, full learning
analytics, real university PDF retrieval validation, and a production
Kubernetes operating standard.

## 3. Functional requirements

| ID | Requirement | Verified implementation |
|---|---|---|
| FR-01 | A user authenticates with Clerk and receives a server-side role | JWT verification and local user provisioning |
| FR-02 | A student, professor, or administrator sees role-appropriate features | Frontend guards and FastAPI role dependencies |
| FR-03 | Users upload and search private documents | PDF/DOCX/PPTX/TXT/Markdown extraction and pgvector search |
| FR-04 | Answers cite source documents and locations | RAG source metadata and citation-label validation |
| FR-05 | The supervisor routes requests to specialist agents | LangGraph routing and dependency-aware batches |
| FR-06 | Agent runs and timeline events persist | AgentRun and AgentStep records |
| FR-07 | Conversations persist and can be deleted | Conversation and Message records |
| FR-08 | Professors manage courses and course content | Workspaces, courses, enrollment, assignments, quizzes |
| FR-09 | Students generate and persist lessons, quizzes, and plans | Learning API and database persistence |
| FR-10 | Students search and save academic papers | Crossref integration and research history |
| FR-11 | Users execute Python in an isolated runner | Internal HTTP runner with network-disabled containers |
| FR-12 | Administrators manage roles, features, workspaces, and audit data | Role-protected administrative API |

## 4. Non-functional requirements

- **Security:** Clerk bearer verification, server-side roles, course-derived
  access, upload validation, rate limiting, and isolated code execution.
- **Reliability:** bounded agent timeout and one evidence retry, transaction
  boundaries, Redis/PostgreSQL readiness, and explicit failure states.
- **Performance:** serial or bounded local model execution, CPU-only defaults,
  one heavyweight model resident at a time, and configurable top-K retrieval.
- **Maintainability:** modular FastAPI routers, reusable `ai/` packages,
  Pydantic models, async SQLAlchemy, and Alembic migrations.
- **Observability:** agent event persistence, health endpoints, structured
  application logging hooks, Docker health checks, and monitoring manifests
  for the infrastructure layer.
- **Portability:** Docker Compose for local/full-stack execution and
  Kubernetes manifests for deployment adaptation.
- **Privacy:** document owner/course filters and server-derived user identity.

## 5. System architecture

The browser communicates with Next.js, which proxies or calls FastAPI using the
configured API URL. FastAPI validates identity and authorization, invokes the
agent service or domain routes, and uses PostgreSQL/pgvector and Redis.

```text
Browser
  -> Next.js App Router
  -> FastAPI /api/v1
       -> Clerk JWT verification
       -> domain services and LangGraph agents
       -> PostgreSQL 17 + pgvector
       -> Redis
       -> Ollama/Hugging Face
       -> internal code runner
```

Key runtime services are PostgreSQL, Redis, Ollama, FastAPI, Next.js, a code
runner, and a one-shot sandbox-image builder.

## 6. Technology choices

| Layer | Choice | Justification |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4 | App Router SSR/client boundaries and strict UI typing |
| UI | shadcn/ui, Base UI, Recharts | Accessible composable interface and dashboard visualization |
| Backend | Python 3.11, FastAPI, Pydantic | Typed HTTP boundaries and async request handling |
| Persistence | async SQLAlchemy, Alembic | Migration-controlled ORM persistence |
| Database | PostgreSQL 17, pgvector | Relational and vector storage in one transactional system |
| Cache | Redis 8 with AOF | Rate-limit state and Redis-backed availability checks |
| AI orchestration | LangChain, LangGraph | Typed state, routing, fan-out, retry, and checkpoint concepts |
| Embeddings | BGE-M3, 1024 dimensions | Multilingual retrieval in CPU-oriented deployment |
| Reranking | BGE reranker (optional) | Second-stage candidate ordering with fallback behavior |
| Generation | Ollama qwen2.5:3b default | Local CPU-compatible inference with configurable endpoint |
| Auth | Clerk | Hosted identity and frontend session management |
| Execution | Docker network-disabled Python sandbox | Resource-bounded execution separated from the API |
| Infrastructure | Docker Compose, Kubernetes manifests | Reproducible local stack and deployment templates |

## 7. Database design

The database combines identity, academic administration, RAG, conversation,
learning, research, notifications, platform configuration, and agent audit
entities.

Primary families:

- **Identity/access:** users, workspaces, workspace members, courses,
  enrollments.
- **Academic:** tasks, task progress, assignment submissions, study plans,
  learning lessons, quizzes, quiz questions, quiz attempts.
- **RAG:** documents, document_chunks, with 1024-dimensional vectors.
- **Conversation/agents:** conversations, messages, agent_runs, agent_steps.
- **Research:** research_papers, research_search_history.
- **Platform:** feature flags, audit logs, notifications.

Important constraints include owner and course scoping, role check constraints,
unique workspace/course codes and quiz positions, enrollment status checks,
task/quiz constraints, and cascade/delete behavior. The RAG chunk table uses a
vector cosine HNSW index and a GIN full-text index.

## 8. API architecture

The API is versioned below `/api/v1` for domain routes and exposes health
endpoints at `/health`. FastAPI generates OpenAPI at `/docs` and `/openapi.json`.
All application routes except health and the compatibility test route require
Clerk bearer authentication unless individually documented otherwise.

Domain route groups include agents/conversations, documents, users, courses,
learning, research, dashboard, administrator, notifications, and coding.
Authentication is managed by Clerk; the API validates the bearer token and
provisions or resolves a local user. There is no UniMind username/password API.

Common status codes are `400` validation, `401` unauthenticated, `403`
unauthorized role, `404` inaccessible or missing resource, `422` request schema
validation, `429` rate limit, `500` server fault, `503` unavailable identity or
dependency. RAG upload/search and code runner routes can additionally return
explicit service-unavailable responses.

## 9. Multi-agent architecture

The seven core agent types are Supervisor, Knowledge, Research, Learning,
Coding, Planning, and University Services. The supervisor uses a routing matrix
and returns a selected-agent plan. LangGraph builds simple QA, supervisor,
knowledge QA, learning, planning, and combined graphs.

The execution layer supports:

- single-agent or parallel fan-out routing;
- dependency-aware execution batches;
- one configured retry for execution failure or insufficient evidence;
- per-agent timeout;
- persisted event steps and run status;
- human-approval state for outputs that explicitly require it;
- in-graph checkpoint support when a saver is supplied.

Human approval is represented by workflow state but is not yet a complete
production approval UX or policy engine.

## 10. LangGraph workflow

The agent graph records the request, routes it, expands a dependency-aware
execution plan, runs one or more agents, evaluates results, retries eligible
agents once, advances batches, and produces the final response. Agent failures
become structured output and persisted failure events rather than silently
fabricated answers.

## 11. RAG pipeline

### 11.1 Ingestion

Documents pass extension, declared MIME, content-signature, size, UTF-8, and
extracted-content validation. PDF and PPTX page/slide metadata is retained.
DOCX headings and tables, Markdown headings, and text structure are considered
by chunking. Fixed-size, overlapping, recursive, and structure-aware strategies
are available.

Chunks carry document, owner, course, chunk index, source, section, page, and
embedding-model metadata. 1024-dimensional vectors are stored in pgvector.

### 11.2 Retrieval

Retrieval filters by owner or authorized course and optional document/model
constraints. It merges cosine similarity and PostgreSQL simple full-text rank,
deduplicates text, reranks with an optional cross-encoder, and limits context
size. Retrieved content is escaped and delimited as untrusted evidence.

The ContextAssembler creates citations from document identifiers and available
page numbers. Citation validation verifies answer labels against retrieved
context. Prompt-injection phrase detection is defense-in-depth only.

## 12. Security architecture

Clerk JWT verification checks signature, issuer, authorized party, and expiry.
The API derives roles from the local database and bootstraps initial
administrators only from configured Clerk IDs. Course permissions are derived
from ownership, active enrollment, or administrator status; browser-provided
role/course values are not trusted.

Document extraction validates format and size. RAG repository searches enforce
owner/course filters. Redis fixed-window rate limiting is enabled by default
in production and in Compose. Failures return 503 rather than bypassing
protection.

The coding runner has no network, a read-only root filesystem, non-root
identity, CPU/memory/process/time/output limits, and a short-lived container.
The runner mounts the Docker socket, therefore its deployment isolation is a
host security boundary and must use a dedicated or rootless daemon.

## 13. DevOps architecture

Docker Compose builds and starts PostgreSQL, Redis, Ollama, FastAPI, code
runner, sandbox image, and Next.js. Named volumes persist database, Redis,
Ollama models, and Hugging Face caches. Health endpoints gate startup and
readiness.

Kubernetes manifests are checked in under `infrastructure/kubernetes/`;
Prometheus/Grafana assets are under `infrastructure/monitoring/`. Their runtime
deployment has not been validated by this report unless live checks are
provided.

Repository checks include:

- `pnpm check` for frontend lint, TypeScript, and Vitest;
- `uv run ruff check . ../../ai`;
- `uv run pytest`;
- `docker compose up --build`;
- optional Playwright E2E with a running browser.

No `.github/workflows` CI manifest is currently present in the repository,
despite CI/CD directory structure. Pipeline automation is therefore a defined
future/dev-setup item, not a claimed deployed capability.

## 14. Verified status and limitations

The following evidence was verified during Phase 8:

- Backend test suite: 128 passed, 1 skipped.
- Frontend check: ESLint passed, TypeScript passed, 16 Vitest tests passed.
- Git worktree: clean before implementation.
- Phase 6 result artifacts: produced; the run used 2 placeholder questions,
  and all retrieval/citation/operational metrics were zero.

The following remain environment-dependent:

- Docker full-stack startup.
- PostgreSQL/Redis integration and real model inference.
- Real university PDF citation validation.
- Playwright E2E tests.
- Kubernetes deployment and live monitoring.
- Human-reviewed 50–100-question experiment.

## 15. Future improvements

Priority work includes a human-reviewed university corpus, production-quality
paired evaluation, Ragas configuration with trustworthy judge data, Playwright
CI with browser provisioning, stronger prompt-injection defenses, comprehensive
learning analytics, push notifications, human approval flows, model observability,
and a tested Kubernetes deployment.
