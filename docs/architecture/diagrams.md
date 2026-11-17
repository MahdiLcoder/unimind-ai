# Architecture diagrams

All diagrams use Mermaid so they remain reviewable and version-controlled.

## 1. Global system architecture

```mermaid
flowchart LR
    U[Student / Professor / Administrator] --> W[Next.js 16 frontend]
    W -->|Bearer JWT| A[FastAPI API]
    A --> I[Clerk identity verification]
    A --> G[LangGraph agent service]
    G --> K[Knowledge]
    G --> R[Research]
    G --> L[Learning]
    G --> C[Coding]
    G --> P[Planning]
    G --> S[University Services]
    G --> X[Supervisor]
    A --> DB[(PostgreSQL 17 + pgvector)]
    A --> RD[(Redis)]
    A --> O[Ollama]
    G --> HF[Hugging Face optional inference]
    A --> CR[Internal code runner]
    CR --> PX[Network-disabled Python containers]
```

## 2. Frontend/backend communication

```mermaid
sequenceDiagram
    actor User
    participant UI as Next.js UI
    participant Clerk
    participant API as FastAPI
    participant DB as PostgreSQL
    User->>UI: Sign in
    UI->>Clerk: Clerk session
    Clerk-->>UI: Session/JWT
    UI->>API: Authorization: Bearer <JWT>
    API->>Clerk: JWKS/issuer verification
    API->>DB: Resolve local user and role
    API-->>UI: Pydantic-validated response
    UI-->>User: Render result
```

## 3. Database ERD

```mermaid
erDiagram
    USER ||--o{ WORKSPACE_MEMBER : belongs
    WORKSPACE ||--o{ WORKSPACE_MEMBER : contains
    WORKSPACE ||--o{ COURSE : contains
    USER ||--o{ COURSE : professes
    COURSE ||--o{ ENROLLMENT : has
    USER ||--o{ ENROLLMENT : enrolls
    USER ||--o{ DOCUMENT : owns
    DOCUMENT ||--o{ DOCUMENT_CHUNK : contains
    USER ||--o{ CONVERSATION : owns
    CONVERSATION ||--o{ MESSAGE : contains
    CONVERSATION ||--o{ AGENT_RUN : has
    AGENT_RUN ||--o{ AGENT_STEP : emits
    COURSE ||--o{ TASK : contains
    USER ||--o{ TASK_PROGRESS : tracks
    TASK ||--o{ TASK_PROGRESS : has
    TASK ||--o{ ASSIGNMENT_SUBMISSION : receives
    USER ||--o{ STUDY_PLAN : owns
    USER ||--o{ LEARNING_LESSON : owns
    USER ||--o{ QUIZ_ATTEMPT : submits
    QUIZ ||--o{ QUIZ_QUESTION : contains
    QUIZ ||--o{ QUIZ_ATTEMPT : has
    USER ||--o{ RESEARCH_PAPER : saves
    USER ||--o{ RESEARCH_SEARCH_HISTORY : creates
```

## 4. RAG ingestion pipeline

```mermaid
flowchart TD
    F[PDF/DOCX/PPTX/TXT/Markdown] --> V[Validate size, extension, MIME, signature]
    V --> E[Extract text and structure]
    E --> C[Structure-aware or recursive chunking]
    C --> M[Add owner/course/document/page/section metadata]
    M --> X[SentenceTransformer BGE-M3 embedding]
    X --> P[(Postgres document_chunks + pgvector)]
    P --> I[HNSW cosine and GIN full-text indexes]
```

## 5. RAG retrieval pipeline

```mermaid
flowchart TD
    Q[Question] --> Z[Embed question]
    Z --> VS[Cosine vector search]
    Z --> KS[PostgreSQL full-text search]
    VS --> M[Hybrid merge and deduplicate]
    KS --> M
    M --> RR[Optional reranker]
    RR --> A[Access-filtered top K]
    A --> CA[Context assembler, escape untrusted text]
    CA --> G[Ollama or Hugging Face generation]
    G --> CV[Citation validation]
    CV --> ANS[Cited answer and source metadata]
```

## 6. Multi-agent architecture

```mermaid
flowchart TD
    REQ[Authenticated agent request] --> SUP[Supervisor]
    SUP --> RT[Intent and routing matrix]
    RT --> KB[Knowledge]
    RT --> RS[Research]
    RT --> LN[Learning]
    RT --> CD[Coding]
    RT --> PL[Planning]
    RT --> US[University Services]
    KB --> EV[Evaluate evidence]
    RS --> EV
    LN --> EV
    CD --> EV
    PL --> EV
    US --> EV
    EV --> RET{Failed or insufficient?}
    RET -->|One retry|max| AG[Retry eligible agents]
    RET -->|No| FIN[Combine response]
    AG --> EV
    FIN --> SSE[SSE timeline or JSON response]
```

## 7. Supervisor workflow

```mermaid
stateDiagram-v2
    [*] --> RecordRequest
    RecordRequest --> Route
    Route --> PlanBatches
    PlanBatches --> ExecuteBatch
    ExecuteBatch --> Evaluate
    Evaluate --> HumanApproval: sensitive action
    Evaluate --> Retry: eligible failure
    Evaluate --> NextBatch: dependency batch remains
    Evaluate --> Finalize: complete
    Retry --> ExecuteBatch
    NextBatch --> ExecuteBatch
    HumanApproval --> [*]
    Finalize --> [*]
```

## 8. Sequence diagrams

### Course question

```mermaid
sequenceDiagram
    actor Student
    participant UI
    participant API
    participant AG as Agent Service
    participant R as RAG
    participant DB
    Student->>UI: Upload PDF / ask question
    UI->>API: POST document or agent stream
    API->>DB: Derive course and owner access
    API->>AG: Routed knowledge request
    AG->>R: Retrieve allowed context
    R-->>AG: Ranked chunks and citation metadata
    AG-->>UI: SSE timeline, answer, sources
```

### Quiz and study plan

```mermaid
sequenceDiagram
    actor Student
    participant UI
    participant API
    participant Agent as Learning Agent
    participant DB
    Student->>UI: Generate lesson/quiz/plan
    UI->>API: POST learning request
    API->>Agent: Learning activity
    Agent-->>API: Validated generated content
    API->>DB: Persist lesson, quiz, or plan
    API-->>UI: Created resource
```

### Coding execution

```mermaid
sequenceDiagram
    actor Student
    participant UI
    participant API
    participant Runner
    participant Docker
    Student->>UI: Submit short Python program
    UI->>API: POST /api/v1/coding/execute
    API->>Runner: Bounded execution request
    Runner->>Docker: Create network-disabled sandbox
    Docker-->>Runner: stdout/stderr/exit
    Runner-->>API: Execution result
    API-->>UI: Output and errors
```

## 9. Deployment architecture

```mermaid
flowchart TD
    DNS[Host ports 3000/8000] --> WEB[web container]
    WEB --> API[ai-api container]
    API --> PG[(Postgres volume)]
    API --> RED[(Redis AOF volume)]
    API --> OL[Ollama container]
    API --> CR[code-runner container]
    CR --> SAN[network:none sandbox containers]
    OL --> OV[(ollama_data volume)]
    API --> HV[(hf_model_cache volume)]
    SAN -. Docker socket authority .-> CR
```

## 10. CI/CD pipeline

```mermaid
flowchart LR
    DEV[Developer commit] --> GHA[GitHub Actions - to be added]
    GHA --> JS[pnpm lint/typecheck/test]
    GHA --> PY[uv ruff/pytest]
    GHA --> IMG[Docker build]
    IMG --> INT[Compose health and integration checks]
    INT --> E2E[Optional Playwright]
    INT --> PUS[Registry push - future]
    PUS --> DEP[Kubernetes rollout - future]
```

Status: the diagram shows the target pipeline. The repository currently has no
verified `.github/workflows` CI manifest or live registry/deployment step.
