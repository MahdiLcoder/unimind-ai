# UniMind AI University Defense Presentation

Format: 12–15 slides. Each implementation statement should point to a verified
repository path or live demo.

## Slide 1 - Title

- UniMind AI
- Intelligent university assistant
- Collaborative multi-agent RAG system
- Student name, supervisor, institution, date

## Slide 2 - Project introduction

- University students need course-grounded assistance across documents,
  planning, research, and programming.
- Professors need course administration and learning activity review.
- Administrators need roles, workspaces, feature controls, and auditability.

## Slide 3 - Problem statement

- Course content is distributed across PDFs, websites, portals, and tools.
- Direct chat responses may lack course context or citations.
- Generic assistants do not enforce role/course permissions.
- Academic work spans retrieval, planning, research, coding, and collaboration.

## Slide 4 - Objectives

- Ground answers in permitted material.
- Expose citations and source context.
- Route complex requests through specialist agents.
- Persist academic workflows.
- Provide role-aware interfaces.
- Operate within CPU-oriented development hardware.

## Slide 5 - Existing solutions and limitations

- Chat-only assistants: conversational but often ungrounded.
- Search engines: useful discovery but not personalized workflow support.
- Static course portals: structured but weakly conversational.
- Direct RAG: retrieval and generation, but limited specialist coordination.

## Slide 6 - Proposed solution

- Next.js application and FastAPI API.
- Clerk identity and server-side authorization.
- PostgreSQL 17 + pgvector and Redis.
- LangGraph Supervisor and seven specialist agent types.
- Hugging Face/BGE retrieval and Ollama generation.
- Dockerized code execution and deployment.

## Slide 7 - Architecture

Use `docs/architecture/diagrams.md` global architecture and communication
diagrams. Emphasize identity, access filtering, data stores, agent graph,
generation, and isolation.

## Slide 8 - Technology justification

Explain:

- FastAPI/Pydantic for typed async APIs;
- Next.js App Router for role-oriented UI;
- PostgreSQL/pgvector to combine relational access and vectors;
- Redis for fixed-window protection/readiness;
- LangGraph for stateful routing and retries;
- CPU Ollama/BGE for hardware compatibility.

## Slide 9 - Implementation

Demonstrate the application modules:

- workspace and private documents;
- courses and enrollment;
- learning lessons, quizzes, and study plans;
- Crossref research;
- coding sandbox;
- dashboard, notifications, and administration.

Distinguish verified modules from environment-dependent model checks.

## Slide 10 - Multi-agent demonstrations

Show:

- route matrix;
- one agent / parallel fan-out / dependency batch;
- evidence evaluation;
- one bounded retry;
- persisted timeline and agent run state.

Use one live scenario and one recorded fallback if live inference is unavailable.

## Slide 11 - Experimental results

Present:

- the stored run is placeholder-v0 with 2 rows;
- direct RAG mean latency 30,674.4 ms;
- supervisor mean latency 45,091.1 ms;
- all retrieval/citation/operational metrics 0.000;
- supervisor routing accuracy 0.500;
- Ragas and cost/token values unavailable.

Do not present placeholder results as product quality or statistical evidence.

## Slide 12 - Security

- Clerk JWT verification;
- server-side roles;
- course/document access derivation;
- upload validation;
- rate limiting;
- untrusted RAG context;
- Docker network-disabled code execution;
- Docker socket host-boundary warning.

## Slide 13 - Limitations

- no human-reviewed 50–100-question corpus;
- no real university PDF/model smoke result;
- no production Ragas benchmark;
- human approval UX incomplete;
- Push notifications and comprehensive analytics incomplete;
- Kubernetes and live monitoring are templates, not fully verified;
- no GitHub Actions workflow currently checked in.

## Slide 14 - Future improvements

- approved academic dataset and human review;
- paired statistical evaluation;
- stronger prompt-injection defenses;
- CI browser/model/database integration;
- human approval policy;
- monitoring and alerting in production;
- analytics and notification providers;
- tested Kubernetes deployment.

## Slide 15 - Conclusion

- UniMind AI implements a coherent university-assistant architecture.
- Core domain, RAG, agent, security, and persistence code exists.
- Quality and defense claims require a reviewed corpus and live environment.
- The repository provides test evidence and a reproducible experiment path.
