# Student user guide

## Sign in

Open the Next.js application, use Clerk sign-in, and complete the configured
authentication flow. New accounts receive the `student` role.

## Dashboard

The dashboard summarizes tasks, courses, quizzes, deadlines, agent runs, and
notifications.

## Workspace

Use `/workspace` to:

- upload PDF, DOCX, PPTX, TXT, or Markdown documents;
- limit retrieval to an accessible course;
- list and delete owned documents;
- search semantically;
- start an agent conversation and inspect source citations.

Upload only content you are permitted to process. Scanned PDFs without an OCR
text layer are not accepted because extracted text is required.

## Course question answering

1. Open workspace or courses.
2. Select or confirm an allowed course.
3. Upload the course PDF.
4. Ask a specific question.
5. Check the returned cited labels and source metadata.
6. If no evidence is available, treat the answer as unsupported rather than as
   authoritative.

## Learning Studio

Use `/learning` to create or inspect:

- learning lessons;
- practice quizzes;
- timed mock exams;
- study plans;
- task and assignment status.

## Research

Use `/research` to search Crossref, save papers, summarize metadata/abstract
text, and compare selected saved papers. Crossref results can be incomplete or
change over time; verify DOI, authors, and year before using a paper.

## Coding

Use `/coding` for tutoring, code generation, review, debugging, and
short standard-library Python execution. Execution is network-disabled and
resource-bounded. Do not submit secrets or rely on the sandbox for sensitive
workloads.

## Conversations

The agent interface persists owned conversations and agent timeline events.
Delete a conversation from its history/list controls if the UI provides it.
