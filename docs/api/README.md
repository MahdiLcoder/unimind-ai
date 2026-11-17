# UniMind AI API documentation

Base URL: `http://localhost:8000` in local development.

OpenAPI: `GET /docs`, `GET /openapi.json`.

## Authentication

UniMind AI does not implement username/password or registration endpoints.
Authentication is delegated to Clerk. The Next.js application obtains a Clerk
session and sends its bearer token:

```http
Authorization: Bearer <clerk-access-token>
```

The API verifies signature, issuer, authorized party, and expiry. It then
provisions or resolves the server-side `users` record and role.

Roles:

- `student`
- `professor`
- `administrator`

New users default to `student`. IDs in `ADMIN_CLERK_USER_IDS` are promoted to
administrator on authentication, including existing accounts. Remove an ID
after promotion if its role should be managed through the administrator API.
Other role changes require an administrator.

| Status | Meaning |
|---|---|
| 401 | Missing, malformed, expired, or invalid bearer token |
| 403 | Valid identity but insufficient role or resource permission |
| 503 | Clerk/JWKS verification unavailable |

Example:

```bash
curl -H "Authorization: Bearer $CLERK_TOKEN" \
  http://localhost:8000/api/v1/users/me
```

## Health APIs

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/health/live` | No | Liveness |
| GET | `/health` | No | Compatibility health |
| GET | `/health/ready` | No | PostgreSQL and Redis readiness |
| GET | `/api/v1/test` | No | Frontend connection check |

Ready response example:

```json
{
  "status": "ready",
  "dependencies": {
    "postgresql": {"status": "ready"},
    "redis": {"status": "ready"}
  }
}
```

If a dependency fails, readiness returns `503`.

## User APIs

| Method | Route | Role | Description |
|---|---|---|---|
| GET | `/api/v1/users/me` | Authenticated | Current profile |
| PATCH | `/api/v1/users/me` | Authenticated | App-owned profile fields |
| GET | `/api/v1/users` | Administrator | List users |
| PATCH | `/api/v1/users/{clerk_user_id}/role` | Administrator | Update role |

Example request:

```bash
curl -X PATCH \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Ada Student","student_number":"S-001"}' \
  http://localhost:8000/api/v1/users/me
```

## Course APIs

Course routes include workspace management, course listing/creation, enrollment,
course details, and professor/student access. Browser-provided permissions are
not trusted.

| Method | Route family | Auth/role |
|---|---|---|
| POST/GET | `/api/v1/workspaces` | Authenticated; creation/management role checks |
| POST/GET | `/api/v1/courses` | Authenticated; catalog and ownership/enrollment checks |
| POST/DELETE | `/api/v1/courses/{course_id}/enrollments` | Role and course access checks |

Example catalog call:

```bash
curl -H "Authorization: Bearer $CLERK_TOKEN" \
  http://localhost:8000/api/v1/courses/catalog
```

Errors include `400` invalid course data, `403` not authorized, `404` course
not found or inaccessible, and `409` duplicate constraint.

## Document APIs

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/documents` | Authenticated | Upload PDF/DOCX/PPTX/TXT/Markdown |
| GET | `/api/v1/documents` | Authenticated | List owned/allowed documents |
| DELETE | `/api/v1/documents/{document_id}` | Authenticated | Delete an allowed document |
| POST | `/api/v1/documents/search` | Authenticated | Semantic/hybrid search |

Upload example:

```bash
curl -X POST \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -F "file=@lecture.pdf" \
  -F "course_id=course-uuid" \
  http://localhost:8000/api/v1/documents
```

Expected success: `201`, with document ID and source metadata.

Search example:

```bash
curl -X POST \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is supervised learning?","top_k":5}' \
  http://localhost:8000/api/v1/documents/search
```

Validation and operational errors include `413` file too large, `422` unsupported
or malformed content, `404` inaccessible document/course, `503` embedding or
retrieval dependency unavailable.

## Conversation and AI execution APIs

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/agents` | Authenticated | Execute a multi-agent request |
| POST | `/api/v1/agents/stream` | Authenticated | SSE execution timeline |
| GET | `/api/v1/agents/conversations` | Authenticated | List conversations |
| DELETE | `/api/v1/agents/conversations/{conversation_id}` | Authenticated | Delete owned conversation |
| GET | `/api/v1/agents/conversations/{conversation_id}/history` | Authenticated | Read persisted history |

Request:

```json
{
  "conversation_id": "00000000-0000-4000-8000-000000000001",
  "message": "Create a revision plan from this course",
  "course_id": null
}
```

Response:

```json
{
  "run_id": "00000000-0000-4000-8000-000000000010",
  "response": "Grounded or agent-generated response",
  "sources": [],
  "agent_outputs": {},
  "events": []
}
```

Stream media type: `text/event-stream`, with SSE `event` and JSON `data` fields.

## Learning APIs

Learning routes cover tasks, submissions, study plans, quizzes, lessons,
learning progress, and generated practice/mock exams.

Representative routes:

- `GET/POST/PATCH/DELETE /api/v1/tasks`
- `GET /api/v1/tasks/submissions/mine`
- `GET/POST/PATCH /api/v1/study-plans`
- `POST /api/v1/quizzes`
- `GET /api/v1/quizzes`
- `GET/POST /api/v1/learning/lessons`
- `GET /api/v1/learning/progress`

Example:

```bash
curl -X POST \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Database exam revision","starts_on":"2026-11-17","ends_on":"2026-11-24"}' \
  http://localhost:8000/api/v1/study-plans
```

## Quiz APIs

Quiz creation/publishing/attempt routes are under the learning router.
Practice quizzes have no fixed duration; mock exams require at least five
minutes. Submitted attempt answers and scores are stored according to route
authorization.

Representative statuses:

- `201` quiz or attempt created;
- `200` detail/list/update;
- `404` inaccessible quiz/task;
- `422` invalid assessment type, duration, or submitted structure;
- `403` role/course constraint.

## Planning APIs

Study plans and adaptive rescheduling are represented by
`/api/v1/study-plans`. Schedule data is persisted as JSONB. The route set
supports list, create, update, reschedule/adaptive operations, and delete
where implemented.

## Research APIs

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/research/search` | Crossref search and history |
| GET | `/api/v1/research/papers` | Saved per-user papers |
| POST | `/api/v1/research/papers` | Save paper |
| POST | `/api/v1/research/papers/{paper_id}/summary` | Generate metadata/abstract summary |
| POST | `/api/v1/research/compare` | Compare selected saved papers |
| DELETE | `/api/v1/research/papers/{paper_id}` | Remove saved paper |

Example:

```bash
curl -X POST \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"retrieval augmented generation","rows":10}' \
  http://localhost:8000/api/v1/research/search
```

## Coding APIs

```bash
curl -X POST \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"print(sum(range(10)))","timeout_seconds":5}' \
  http://localhost:8000/api/v1/coding/execute
```

Execution is standard-library-only, network-disabled, and time/resource
bounded. `400/422` covers invalid input, `503` covers runner failure, and
`408/504` may represent execution timeout depending on the runner boundary.

## Administrative APIs

| Method | Route | Role |
|---|---|---|
| GET/PUT | `/api/v1/admin/features` | Administrator |
| GET/DELETE | `/api/v1/admin/workspaces` | Administrator |
| GET | `/api/v1/admin/audit-logs` | Administrator |
| GET | `/api/v1/admin/agent-runs` | Administrator |

Role APIs and protected platform functions return `403` for valid identities
with insufficient rights.

## Dashboard and notifications

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/notifications`
- `POST /api/v1/notifications/{notification_id}/read`

Notifications are persistent and in-app; push delivery is not implemented.

## Common error format

FastAPI commonly returns:

```json
{"detail":"Human-readable error"}
```

FastAPI request-validation errors use `422` with a `detail` array. SSE failures
are represented as stream events and may mark the persisted run as failed.
