# Learning and planning API

The authenticated learning and planning routes are mounted under `/api/v1`.
FastAPI's generated OpenAPI schema at `/openapi.json` is the canonical
machine-readable contract; the interactive Swagger UI is available at `/docs`.

## Persisted learning content

- `POST /lessons/generate` creates a lesson with the Learning agent and saves
  the generated content for the requesting user.
- `GET /lessons` lists only that user's saved lessons.
- `POST /quizzes/generate` creates and saves a practice quiz. Course quizzes
  can only be published by professors or administrators with server-validated
  course access.
- `POST /flashcards/generate` creates flashcards for the current response.
  Flashcards are not persisted.
- `POST /quizzes/{quiz_id}/attempts` scores and persists a quiz attempt.
- `GET /learning/progress` summarizes the authenticated user's persisted quiz
  attempts and counts missed questions by quiz topic.

Course IDs are checked against the authenticated principal's server-derived
course access. A lesson is private to the user who generated it even when it
includes a course context. Lesson and quiz generation failures are returned as
upstream errors and are not saved.

## Study planning

- `GET/POST /study-plans` lists and creates persisted plans.
- `POST /study-plans/generate` generates and saves a capacity-bounded schedule.
- `PATCH /study-plans/{plan_id}` updates an owned plan.
- `GET/POST/PATCH/DELETE /tasks` manages persisted personal tasks; course tasks
  have separate course-scoped routes.

Schedule changes are explicit user/API edits. The application does not
automatically reschedule user-edited tasks or plan blocks.

The Learning Studio calendar is a presentation of tasks with deadlines and
blocks from active persisted study plans; it does not create calendar data or
modify either schedule.
