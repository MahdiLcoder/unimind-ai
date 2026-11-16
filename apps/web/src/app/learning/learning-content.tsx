"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { apiFetch, apiRequest } from "@/lib/api";

const taskSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().nullable(),
  created_by: z.string(),
  course_id: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  due_at: z.string().nullable(),
  status: z.enum(["pending", "in_progress", "completed"]),
  priority: z.enum(["low", "medium", "high"]),
  created_at: z.string(),
  updated_at: z.string(),
});
const studyPlanSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  schedule: z.array(z.object({
    day: z.string(),
    topic: z.string(),
    duration_minutes: z.number(),
    course_id: z.string().nullable(),
    priority: z.string().nullable(),
    rationale: z.string().nullable(),
  })),
  status: z.enum(["active", "completed", "archived"]),
  created_at: z.string(),
  updated_at: z.string(),
});
const quizQuestionSchema = z.object({
  id: z.string().uuid(),
  position: z.number(),
  prompt: z.string(),
  options: z.array(z.string()),
  points: z.number(),
});
const quizSchema = z.object({
  id: z.string().uuid(),
  creator_id: z.string(),
  course_id: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  published: z.boolean(),
  created_at: z.string(),
  questions: z.array(quizQuestionSchema),
});
const quizAttemptSchema = z.object({
  id: z.string().uuid(),
  quiz_id: z.string().uuid(),
  score: z.number(),
  total_points: z.number(),
  submitted_at: z.string(),
  feedback: z.array(z.object({
    question_id: z.string().uuid(),
    correct: z.boolean(),
    answer: z.string().nullable(),
    explanation: z.string().nullable(),
    earned_points: z.number(),
    total_points: z.number(),
  })),
});
const userProfileSchema = z.object({
  role: z.enum(["student", "professor", "administrator"]),
});
const courseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});

type Task = z.infer<typeof taskSchema>;
type StudyPlan = z.infer<typeof studyPlanSchema>;
type Quiz = z.infer<typeof quizSchema>;
type Attempt = z.infer<typeof quizAttemptSchema>;
type Course = z.infer<typeof courseSchema>;

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The request could not be completed";
}

export default function LearningContent() {
  const { getToken } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [role, setRole] = useState<"student" | "professor" | "administrator" | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planTopic, setPlanTopic] = useState("");
  const [planStart, setPlanStart] = useState("");
  const [planEnd, setPlanEnd] = useState("");
  const [dailyCapacity, setDailyCapacity] = useState(120);
  const [planningContext, setPlanningContext] = useState("");
  const [quizTopic, setQuizTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [quizCourseId, setQuizCourseId] = useState("");
  const [quizPublished, setQuizPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const token = useCallback(async () => {
    const value = await getToken();
    if (!value) throw new Error("No active session token was returned");
    return value;
  }, [getToken]);

  const load = useCallback(async () => {
    const accessToken = await token();
    const [taskList, planList, quizList, profile, courseList] = await Promise.all([
      apiRequest("/api/v1/tasks", z.array(taskSchema), { accessToken }),
      apiRequest("/api/v1/study-plans", z.array(studyPlanSchema), { accessToken }),
      apiRequest("/api/v1/quizzes", z.array(quizSchema), { accessToken }),
      apiRequest("/api/v1/users/me", userProfileSchema, { accessToken }),
      apiRequest("/api/v1/courses", z.array(courseSchema), { accessToken }),
    ]);
    setTasks(taskList);
    setPlans(planList);
    setQuizzes(quizList);
    setRole(profile.role);
    setCourses(courseList);
    setQuizCourseId((selected) => selected || courseList[0]?.id || "");
  }, [token]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(load)
      .catch((cause: unknown) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const accessToken = await token();
      await apiRequest("/api/v1/tasks", taskSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle,
          due_at: taskDue ? new Date(taskDue).toISOString() : null,
        }),
        accessToken,
      });
      setTaskTitle("");
      setTaskDue("");
      setNotice("Task created.");
      await load();
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function updateTask(task: Task, status: Task["status"]) {
    setError(null);
    try {
      const accessToken = await token();
      await apiRequest(`/api/v1/tasks/${task.id}`, taskSchema, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        accessToken,
      });
      await load();
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function deleteTask(task: Task) {
    setError(null);
    try {
      const accessToken = await token();
      const response = await apiFetch(
        `/api/v1/tasks/${task.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) throw new Error(`Could not delete task (${response.status})`);
      await load();
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const accessToken = await token();
      await apiRequest("/api/v1/study-plans/generate", studyPlanSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: planTitle,
          topic: planTopic,
          starts_on: planStart,
          ends_on: planEnd,
          available_minutes_per_day: dailyCapacity,
          planning_context: planningContext || null,
        }),
        accessToken,
      });
      setPlanTitle("");
      setPlanTopic("");
      setPlanStart("");
      setPlanEnd("");
      setPlanningContext("");
      setNotice("AI study plan generated and saved.");
      await load();
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function generateQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAttempt(null);
    try {
      const accessToken = await token();
      if (quizPublished && !quizCourseId) {
        throw new Error("Select a course before publishing a quiz.");
      }
      const quiz = await apiRequest("/api/v1/quizzes/generate", quizSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: quizTopic,
          question_count: questionCount,
          course_id: quizCourseId || null,
          published: quizPublished && (role === "professor" || role === "administrator"),
        }),
        accessToken,
      });
      setActiveQuiz(quiz);
      setAnswers({});
      setQuizTopic("");
      setNotice("Quiz generated and saved.");
      await load();
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function submitQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeQuiz) return;
    setError(null);
    try {
      const accessToken = await token();
      const result = await apiRequest(
        `/api/v1/quizzes/${activeQuiz.id}/attempts`,
        quizAttemptSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
          accessToken,
        },
      );
      setAttempt(result);
    } catch (cause) {
      setError(message(cause));
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between border-b pb-6">
        <div>
          <Link className="text-sm text-muted-foreground hover:text-foreground" href="/dashboard">Dashboard</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Learning & planning</h1>
          <p className="mt-2 text-muted-foreground">Manage deadlines, revision plans, and scored practice.</p>
        </div>
        <UserButton />
      </header>

      {error && <p className="mt-6 rounded-lg border border-destructive/40 p-4 text-sm" role="alert">{error}</p>}
      {notice && <p className="mt-6 rounded-lg border p-4 text-sm" role="status">{notice}</p>}
      {loading && <p className="mt-6" role="status">Loading your learning data…</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold">Academic planner</h2>
          <form className="mt-4 grid gap-3 rounded-xl border p-5 sm:grid-cols-2" onSubmit={createTask}>
            <label className="text-sm sm:col-span-2" htmlFor="task-title">Task or assignment</label>
            <input className="h-10 rounded-md border bg-background px-3 sm:col-span-2" id="task-title" maxLength={200} onChange={(event) => setTaskTitle(event.target.value)} required value={taskTitle} />
            <label className="text-sm" htmlFor="task-due">Due date</label>
            <input className="h-10 rounded-md border bg-background px-3" id="task-due" onChange={(event) => setTaskDue(event.target.value)} type="datetime-local" value={taskDue} />
            <button className="h-10 rounded-md bg-primary px-4 text-primary-foreground sm:col-span-2" type="submit">Add task</button>
          </form>

          <ul className="mt-4 space-y-3">
            {tasks.map((task) => (
              <li className="rounded-xl border p-4" key={task.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{task.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"} · {task.priority}
                    </p>
                    <p className="mt-1 text-xs uppercase text-muted-foreground">{task.status.replace("_", " ")}</p>
                  </div>
                  <div className="flex gap-2">
                    {task.status !== "completed" && (
                      <button className="rounded-md border px-3 py-2 text-sm" onClick={() => void updateTask(task, "completed")} type="button">Complete</button>
                    )}
                    {(task.owner_id !== null || role !== "student") && (
                      <button className="rounded-md border px-3 py-2 text-sm" onClick={() => void deleteTask(task)} type="button">Delete</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
            {!loading && tasks.length === 0 && <li className="rounded-xl border p-4 text-sm text-muted-foreground">No tasks yet.</li>}
          </ul>

          <form className="mt-8 grid gap-3 rounded-xl border p-5 sm:grid-cols-2" onSubmit={createPlan}>
            <h2 className="text-lg font-semibold sm:col-span-2">Generate a study plan</h2>
            <label className="text-sm sm:col-span-2" htmlFor="plan-title">Plan title</label>
            <input className="h-10 rounded-md border bg-background px-3 sm:col-span-2" id="plan-title" maxLength={200} onChange={(event) => setPlanTitle(event.target.value)} required value={planTitle} />
            <label className="text-sm sm:col-span-2" htmlFor="plan-topic">Topic or learning goal</label>
            <textarea className="min-h-20 rounded-md border bg-background px-3 py-2 sm:col-span-2" id="plan-topic" maxLength={2000} minLength={3} onChange={(event) => setPlanTopic(event.target.value)} required value={planTopic} />
            <label className="text-sm" htmlFor="plan-start">Starts</label>
            <label className="text-sm" htmlFor="plan-end">Ends</label>
            <input className="h-10 rounded-md border bg-background px-3" id="plan-start" onChange={(event) => setPlanStart(event.target.value)} required type="date" value={planStart} />
            <input className="h-10 rounded-md border bg-background px-3" id="plan-end" onChange={(event) => setPlanEnd(event.target.value)} required type="date" value={planEnd} />
            <label className="text-sm" htmlFor="plan-capacity">Available minutes per day</label>
            <input className="h-10 rounded-md border bg-background px-3" id="plan-capacity" max={600} min={15} onChange={(event) => setDailyCapacity(Number(event.target.value))} required type="number" value={dailyCapacity} />
            <label className="text-sm sm:col-span-2" htmlFor="plan-context">Known deadlines or constraints (optional)</label>
            <textarea className="min-h-20 rounded-md border bg-background px-3 py-2 sm:col-span-2" id="plan-context" maxLength={4000} onChange={(event) => setPlanningContext(event.target.value)} value={planningContext} />
            <button className="h-10 rounded-md bg-primary px-4 text-primary-foreground sm:col-span-2" type="submit">Generate &amp; save plan</button>
          </form>
          <ul className="mt-4 space-y-2">
            {plans.map((plan) => (
              <li className="rounded-xl border p-4" key={plan.id}>
                <p className="font-medium">{plan.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.starts_on ?? "No start date"} – {plan.ends_on ?? "No end date"} · {plan.schedule.length} scheduled blocks
                </p>
                {plan.summary && <p className="mt-3 whitespace-pre-wrap text-sm">{plan.summary}</p>}
                {plan.schedule.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t pt-3">
                    {plan.schedule.map((block, index) => (
                      <li className="text-sm" key={`${block.day}-${block.topic}-${index}`}>
                        <span className="font-medium">{block.day} · {block.topic}</span>
                        <span className="text-muted-foreground"> · {block.duration_minutes} min{block.priority ? ` · ${block.priority} priority` : ""}</span>
                        {block.rationale && <p className="mt-1 text-muted-foreground">{block.rationale}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Learning studio</h2>
          <form className="mt-4 grid gap-3 rounded-xl border p-5 sm:grid-cols-[1fr_auto_auto]" onSubmit={generateQuiz}>
            <label className="text-sm sm:col-span-3" htmlFor="quiz-topic">Generate a quiz from a topic</label>
            <input className="h-10 min-w-0 rounded-md border bg-background px-3" id="quiz-topic" maxLength={1000} minLength={3} onChange={(event) => setQuizTopic(event.target.value)} required value={quizTopic} />
            <label className="sr-only" htmlFor="quiz-count">Question count</label>
            <input className="h-10 w-20 rounded-md border bg-background px-3" id="quiz-count" max={20} min={1} onChange={(event) => setQuestionCount(Number(event.target.value))} type="number" value={questionCount} />
            <button className="h-10 rounded-md bg-primary px-4 text-primary-foreground" type="submit">Generate</button>
            {(role === "professor" || role === "administrator") && (
              <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2">
                <label className="text-sm" htmlFor="quiz-course">Course (optional)</label>
                <select className="h-10 rounded-md border bg-background px-3" id="quiz-course" onChange={(event) => setQuizCourseId(event.target.value)} value={quizCourseId}>
                  <option value="">Personal quiz</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input checked={quizPublished} onChange={(event) => setQuizPublished(event.target.checked)} type="checkbox" />
                  Publish this quiz to enrolled students
                </label>
              </div>
            )}
          </form>

          {activeQuiz && (
            <form className="mt-5 space-y-5 rounded-xl border p-5" onSubmit={submitQuiz}>
              <div>
                <h3 className="text-lg font-semibold">{activeQuiz.title}</h3>
                {activeQuiz.description && <p className="mt-2 text-sm text-muted-foreground">{activeQuiz.description}</p>}
              </div>
              {activeQuiz.questions.map((question) => (
                <fieldset className="space-y-2" key={question.id}>
                  <legend className="font-medium">{question.position + 1}. {question.prompt}</legend>
                  {question.options.map((option) => (
                    <label className="flex items-center gap-2 text-sm" key={option}>
                      <input
                        checked={answers[question.id] === option}
                        name={question.id}
                        onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                        type="radio"
                        value={option}
                      />
                      {option}
                    </label>
                  ))}
                </fieldset>
              ))}
              <button className="h-10 rounded-md bg-primary px-4 text-primary-foreground" type="submit">Submit answers</button>
            </form>
          )}

          {attempt && (
            <section className="mt-5 rounded-xl border p-5" aria-live="polite">
              <h3 className="font-semibold">Score: {attempt.score} / {attempt.total_points}</h3>
              <ul className="mt-3 space-y-3">
                {attempt.feedback.map((item, index) => (
                  <li className="text-sm" key={item.question_id}>
                    <p>{index + 1}. {item.correct ? "Correct" : `Review: ${item.answer ?? "No answer key available"}`}</p>
                    {item.explanation && <p className="mt-1 text-muted-foreground">{item.explanation}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <h3 className="mt-8 text-lg font-semibold">Saved quizzes</h3>
          <ul className="mt-3 space-y-2">
            {quizzes.map((quiz) => (
              <li className="flex items-center justify-between gap-3 rounded-xl border p-4" key={quiz.id}>
                <div>
                  <p className="font-medium">{quiz.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{quiz.questions.length} questions</p>
                </div>
                <button className="rounded-md border px-3 py-2 text-sm" onClick={() => { setActiveQuiz(quiz); setAnswers({}); setAttempt(null); }} type="button">
                  Practice
                </button>
              </li>
            ))}
            {!loading && quizzes.length === 0 && <li className="rounded-xl border p-4 text-sm text-muted-foreground">Generate a quiz to begin.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
