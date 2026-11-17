# Final demonstration script

All demonstrations should be performed only after confirming the relevant
Clerk account, database, Redis, Ollama model, and optional inference setup.
Use an approved university PDF and recorded account; never present placeholder
benchmark data as a live course answer.

## Scenario 1 - Course question answering

**Objective:** upload a university PDF and demonstrate an unsupported or cited answer.

1. Sign in as a student or professor.
2. Open `/workspace`.
3. Upload an approved course PDF.
4. Confirm the document appears in the document library.
5. Select the course scope, if available.
6. Ask: "According to the uploaded lecture, what is [topic]?"
7. Open the agent timeline and observe the supervisor/knowledge execution.
8. Confirm the final response has source metadata and valid page/citation labels.
9. Explain an unsupported or no-evidence result if the PDF is not retrieved.

**Evidence to show:** upload response, source chunks, agent timeline, citation
labels, and persisted conversation.

**Do not claim:** complete OCR accuracy or human factual verification unless
independently demonstrated.

## Scenario 2 - Exam preparation

**Objective:** generate lessons, quizzes, and a revision schedule.

1. Sign in as a student.
2. Open `/learning`.
3. Request a lesson for a selected course topic.
4. Generate a practice quiz with at least 5–10 items.
5. Generate a mock exam and a study plan with dates.
6. Submit one quiz attempt and show stored score/status.
7. Update the plan/reschedule if this interface is available.
8. Reopen the resources after a page refresh to demonstrate persistence.

**Evidence to show:** lesson and quiz records, mock exam constraints, persisted
plan/schedule, attempt, and database-backed refresh.

**Do not claim:** adaptive performance modeling or predictive learning analytics
because they are not implemented as a comprehensive learning-analytics suite.

## Scenario 3 - Academic research

**Objective:** discover, compare, and save papers.

1. Open `/research`.
2. Search Crossref for a specific topic.
3. Open/select 2–3 results.
4. Save one or more papers.
5. Generate metadata/abstract summaries where available.
6. Compare selected saved papers.
7. Show search history and saved bibliography output.

**Evidence to show:** external search response, saved-paper IDs, summary and
comparison, persisted history.

**Do not claim:** that Crossref is a complete or curated scholarly index.

## Scenario 4 - Programming assistance

**Objective:** generate, review, and safely execute code.

1. Open `/coding`.
2. Ask the coding agent to explain and generate a short Python example.
3. Submit it to the execution endpoint.
4. Show stdout and exit status.
5. Submit a corrected or failing sample and show bounded error handling.
6. Explain that execution is standard-library-only and network-disabled.

**Evidence to show:** coding agent response, runner status, stdout/stderr,
exit code, and sandbox resource limits.

**Do not claim:** general language support or a production unrestricted code
execution service.

## Scenario 5 - Multi-agent collaboration

**Objective:** demonstrate Supervisor routing and timeline.

1. Open workspace/agent chat.
2. Submit a complex request that combines a permitted knowledge question with
   learning, planning, or course-service work.
3. Use SSE streaming so timeline events remain visible.
4. Show selected agents and execution plan.
5. Show parallel or dependency batch events.
6. Show completion, retry, or insufficient-evidence event where observable.
7. Show persisted agent run and agent steps after refresh.

**Evidence to show:** Supervisor route, agent names, batch/retry events,
duration metadata, final response, run status, and database records.

**Do not claim:** independent specialist quality if only routing and
orchestration were demonstrated.

## Demo fallback

If Ollama, Hugging Face, Clerk, or PostgreSQL is unavailable, stop the scenario
and show:

- `/health/live`;
- `/health/ready`;
- Docker service status;
- API logs;
- the relevant automated test instead of inventing a live result.
