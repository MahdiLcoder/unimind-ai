# Professor user guide

## Access

Your Clerk account must have the `professor` role assigned by an administrator
or a configured bootstrap process.

## Workspaces and courses

Use `/courses` to:

- create or join a workspace if permitted;
- create a course in an owned workspace;
- list the course catalog;
- manage course-related tasks and quizzes;
- inspect active enrollment and learning activity.

The API derives course ownership from the database. A browser cannot grant
itself professor course access.

## Course documents

Upload and manage course materials in `/workspace`. Scope private documents to
the intended course only if you are authorized to do so. Deleted documents are
removed with their chunks.

## Assignments and quizzes

Use Learning/Courses functions to:

- create course assignments;
- publish quizzes;
- create practice quizzes or timed mock exams;
- review submissions;
- assign grades and feedback.

Confirm points, answer options, and explanations before publishing.

## Activity review

Use the dashboard and course routes to review course-level task, quiz, and
learning activity available to your role. In-app notifications are persistent
but do not include push delivery.
