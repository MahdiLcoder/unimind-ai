"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Sparkles,
  Calendar,
  CheckCircle2,
  Trash2,
  BrainCircuit,
  Clock,
  Play,
  Award,
  ListTodo,
} from "lucide-react";
import { apiFetch, apiRequest } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";

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
  schedule: z.array(
    z.object({
      day: z.string(),
      topic: z.string(),
      duration_minutes: z.number(),
      course_id: z.string().nullable(),
      priority: z.string().nullable(),
      rationale: z.string().nullable(),
    })
  ),
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
  feedback: z.array(
    z.object({
      question_id: z.string().uuid(),
      correct: z.boolean(),
      answer: z.string().nullable(),
      explanation: z.string().nullable(),
      earned_points: z.number(),
      total_points: z.number(),
    })
  ),
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
        if (active) {
          const err = message(cause);
          setError(err);
          toast.error(err);
        }
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
      toast.success("Task created.");
      await load();
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
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
      toast.success(`Task marked as ${status}`);
      await load();
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function deleteTask(task: Task) {
    setError(null);
    try {
      const accessToken = await token();
      const response = await apiFetch(`/api/v1/tasks/${task.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Could not delete task (${response.status})`);
      toast.success("Task deleted");
      await load();
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
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
      toast.success("AI study plan generated and saved.");
      await load();
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
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
      toast.success("Quiz generated and saved.");
      await load();
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
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
        }
      );
      setAttempt(result);
      toast.success(`Quiz completed! Score: ${result.score} / ${result.total_points}`);
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link className="text-xs font-semibold uppercase tracking-[0.16em] text-primary" href="/dashboard">
              Dashboard
            </Link>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              Learning & planning
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage deadlines, revision plans, and scored practice.
            </p>
          </div>
          <UserButton />
        </header>

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground" role="status">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="mt-8 space-y-4" role="status">
            <p className="sr-only">Loading your learning data…</p>
            <div className="grid gap-6 sm:grid-cols-2">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          </div>
        ) : (
          <Tabs defaultValue="planner" className="mt-8">
            <TabsList className="h-9">
              <TabsTrigger value="planner" className="gap-1.5">
                <ListTodo className="size-3.5" />
                Academic Tasks
                {tasks.length > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{tasks.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="plans" className="gap-1.5">
                <Calendar className="size-3.5" />
                Study Plans
                {plans.length > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{plans.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="quizzes" className="gap-1.5">
                <BrainCircuit className="size-3.5" />
                Learning Studio & Quizzes
                {quizzes.length > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{quizzes.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {/* Tasks Tab */}
            <TabsContent value="planner" className="mt-6">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                {/* Task List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-foreground">Active Tasks & Deadlines</h2>
                    <Badge variant="outline">{tasks.filter((t) => t.status !== "completed").length} pending</Badge>
                  </div>

                  <ul className="space-y-3">
                    {tasks.map((task) => (
                      <li key={task.id}>
                        <Card className="p-4 shadow-xs">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium text-foreground text-sm">{task.title}</h3>
                                <Badge
                                  variant={
                                    task.status === "completed"
                                      ? "secondary"
                                      : task.priority === "high"
                                      ? "destructive"
                                      : "default"
                                  }
                                  className="text-[10px] capitalize"
                                >
                                  {task.priority}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"}
                              </p>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {task.status.replace("_", " ")}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              {task.status !== "completed" && (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => void updateTask(task, "completed")}
                                  type="button"
                                >
                                  <CheckCircle2 className="size-3 mr-1 text-emerald-600" />
                                  Complete
                                </Button>
                              )}
                              {(task.owner_id !== null || role !== "student") && (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className="text-destructive hover:bg-destructive/10"
                                  onClick={() => void deleteTask(task)}
                                  type="button"
                                >
                                  <Trash2 className="size-3 mr-1" />
                                  Delete
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      </li>
                    ))}
                    {tasks.length === 0 && (
                      <EmptyState
                        icon={CheckCircle2}
                        title="No tasks yet"
                        description="Add a task or assignment using the planner on the right."
                      />
                    )}
                  </ul>
                </div>

                {/* Add Task Form */}
                <div>
                  <Card className="p-5 shadow-xs sticky top-24">
                    <CardTitle className="text-base font-semibold">Add a task</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Set assignments, due dates, and study milestones.
                    </CardDescription>
                    <form className="mt-4 space-y-3" onSubmit={createTask}>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1" htmlFor="task-title">
                          Task or assignment
                        </label>
                        <Input
                          id="task-title"
                          maxLength={200}
                          onChange={(event) => setTaskTitle(event.target.value)}
                          placeholder="e.g. Algorithms Problem Set 3"
                          required
                          value={taskTitle}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1" htmlFor="task-due">
                          Due date
                        </label>
                        <Input
                          id="task-due"
                          onChange={(event) => setTaskDue(event.target.value)}
                          type="datetime-local"
                          value={taskDue}
                        />
                      </div>
                      <Button className="w-full" type="submit">
                        Add task
                      </Button>
                    </form>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Study Plans Tab */}
            <TabsContent value="plans" className="mt-6">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                {/* Generated Plans */}
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-foreground">Saved Study Plans</h2>
                  <ul className="space-y-3">
                    {plans.map((plan) => (
                      <li key={plan.id}>
                        <Card className="p-5 shadow-xs">
                          <CardTitle className="text-base font-semibold">{plan.title}</CardTitle>
                          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                            <Clock className="size-3" />
                            {plan.starts_on ?? "No start date"} – {plan.ends_on ?? "No end date"} · {plan.schedule.length} scheduled blocks
                          </p>
                          {plan.summary && (
                            <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-foreground bg-muted/30 p-3 rounded-lg">
                              {plan.summary}
                            </p>
                          )}
                          {plan.schedule.length > 0 && (
                            <div className="mt-4 border-t pt-3">
                              <h4 className="text-xs font-semibold text-foreground mb-2">Schedule breakdown:</h4>
                              <ul className="space-y-2">
                                {plan.schedule.map((block, index) => (
                                  <li
                                    key={`${block.day}-${block.topic}-${index}`}
                                    className="text-xs border rounded-lg p-2.5 bg-card/60"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-foreground">{block.day} · {block.topic}</span>
                                      <Badge variant="outline" className="text-[10px]">
                                        {block.duration_minutes} min
                                      </Badge>
                                    </div>
                                    {block.rationale && (
                                      <p className="mt-1 text-muted-foreground text-[11px] leading-relaxed">
                                        {block.rationale}
                                      </p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </Card>
                      </li>
                    ))}
                    {plans.length === 0 && (
                      <EmptyState
                        icon={Calendar}
                        title="No study plans yet"
                        description="Generate an optimized AI study plan using the generator on the right."
                      />
                    )}
                  </ul>
                </div>

                {/* Generate Plan Form */}
                <div>
                  <Card className="p-5 shadow-xs">
                    <CardTitle className="text-base font-semibold">Generate a study plan</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Our multi-agent planner balances topics, capacity, and deadlines.
                    </CardDescription>
                    <form className="mt-4 space-y-3" onSubmit={createPlan}>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1" htmlFor="plan-title">
                          Plan title
                        </label>
                        <Input
                          id="plan-title"
                          maxLength={200}
                          onChange={(event) => setPlanTitle(event.target.value)}
                          placeholder="e.g. Midterm Preparation"
                          required
                          value={planTitle}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1" htmlFor="plan-topic">
                          Topic or learning goal
                        </label>
                        <Textarea
                          id="plan-topic"
                          maxLength={2000}
                          minLength={3}
                          onChange={(event) => setPlanTopic(event.target.value)}
                          placeholder="e.g. Dynamic Programming, Graph algorithms, and greedy heuristics"
                          required
                          value={planTopic}
                          className="min-h-20 text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1" htmlFor="plan-start">
                            Starts
                          </label>
                          <Input
                            id="plan-start"
                            onChange={(event) => setPlanStart(event.target.value)}
                            required
                            type="date"
                            value={planStart}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1" htmlFor="plan-end">
                            Ends
                          </label>
                          <Input
                            id="plan-end"
                            onChange={(event) => setPlanEnd(event.target.value)}
                            required
                            type="date"
                            value={planEnd}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1" htmlFor="plan-capacity">
                          Available minutes per day
                        </label>
                        <Input
                          id="plan-capacity"
                          max={600}
                          min={15}
                          onChange={(event) => setDailyCapacity(Number(event.target.value))}
                          required
                          type="number"
                          value={dailyCapacity}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1" htmlFor="plan-context">
                          Known deadlines or constraints (optional)
                        </label>
                        <Textarea
                          id="plan-context"
                          maxLength={4000}
                          onChange={(event) => setPlanningContext(event.target.value)}
                          value={planningContext}
                          placeholder="e.g. Have exam on Thursday, busy Wednesday afternoon"
                          className="min-h-16 text-xs"
                        />
                      </div>
                      <Button className="w-full" type="submit">
                        Generate &amp; save plan
                      </Button>
                    </form>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Quizzes Tab */}
            <TabsContent value="quizzes" className="mt-6">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                {/* Active Quiz Area & Saved Quizzes */}
                <div className="space-y-6">
                  {activeQuiz ? (
                    <Card className="p-6 shadow-sm border-primary/40">
                      <form className="space-y-6" onSubmit={submitQuiz}>
                        <div>
                          <Badge variant="outline" className="mb-2">Active Quiz</Badge>
                          <h3 className="text-xl font-semibold text-foreground">{activeQuiz.title}</h3>
                          {activeQuiz.description && (
                            <p className="mt-1 text-xs text-muted-foreground">{activeQuiz.description}</p>
                          )}
                        </div>

                        {activeQuiz.questions.map((question) => (
                          <fieldset className="space-y-2 border-t pt-4" key={question.id}>
                            <legend className="text-sm font-medium text-foreground">
                              {question.position + 1}. {question.prompt}
                            </legend>
                            <div className="mt-2 space-y-2">
                              {question.options.map((option) => (
                                <label
                                  className={`flex items-center gap-2.5 rounded-lg border p-3 text-sm cursor-pointer transition-colors ${
                                    answers[question.id] === option
                                      ? "border-primary bg-primary/5 text-foreground font-medium"
                                      : "border-border hover:bg-muted/40 text-muted-foreground"
                                  }`}
                                  key={option}
                                >
                                  <input
                                    checked={answers[question.id] === option}
                                    name={question.id}
                                    onChange={() =>
                                      setAnswers((current) => ({
                                        ...current,
                                        [question.id]: option,
                                      }))
                                    }
                                    type="radio"
                                    value={option}
                                    className="accent-primary size-4"
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ))}

                        <Button className="w-full" type="submit">
                          Submit answers
                        </Button>
                      </form>

                      {attempt && (
                        <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5 animate-in fade-in-50" aria-live="polite">
                          <div className="flex items-center justify-between">
                            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                              <Award className="size-5 text-primary" />
                              Quiz Results
                            </h3>
                            <Badge variant="default" className="text-sm">
                              Score: {attempt.score} / {attempt.total_points}
                            </Badge>
                          </div>
                          <ul className="mt-4 space-y-3">
                            {attempt.feedback.map((item, index) => (
                              <li key={item.question_id} className="text-xs border rounded-lg p-3 bg-background">
                                <p className="font-semibold text-foreground">
                                  Question {index + 1}:{" "}
                                  <span className={item.correct ? "text-emerald-600" : "text-destructive"}>
                                    {item.correct ? "✓ Correct" : `✗ Review: ${item.answer ?? "No answer key available"}`}
                                  </span>
                                </p>
                                {item.explanation && (
                                  <p className="mt-1 text-muted-foreground leading-relaxed">{item.explanation}</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </Card>
                  ) : null}

                  {/* Saved Quizzes */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-4">Saved practice quizzes</h3>
                    <ul className="space-y-3">
                      {quizzes.map((quiz) => (
                        <li key={quiz.id}>
                          <Card className="p-4 flex items-center justify-between shadow-xs">
                            <div>
                              <p className="font-medium text-sm text-foreground">{quiz.title}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {quiz.questions.length} questions · {new Date(quiz.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActiveQuiz(quiz);
                                setAnswers({});
                                setAttempt(null);
                              }}
                              type="button"
                              className="gap-1.5"
                            >
                              <Play className="size-3.5" />
                              Practice
                            </Button>
                          </Card>
                        </li>
                      ))}
                      {quizzes.length === 0 && (
                        <EmptyState
                          icon={BrainCircuit}
                          title="No quizzes generated yet"
                          description="Generate a custom quiz from any topic or lecture note to begin."
                        />
                      )}
                    </ul>
                  </div>
                </div>

                {/* Generator Form */}
                <div>
                  <Card className="p-5 shadow-xs sticky top-24">
                    <CardTitle className="text-base font-semibold">Generate a quiz</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      AI crafts targeted multiple-choice questions with instant scoring.
                    </CardDescription>

                    <form className="mt-4 space-y-3" onSubmit={generateQuiz}>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1" htmlFor="quiz-topic">
                          Topic or concept
                        </label>
                        <Input
                          id="quiz-topic"
                          maxLength={1000}
                          minLength={3}
                          onChange={(event) => setQuizTopic(event.target.value)}
                          placeholder="e.g. Asymptotic Notation and Recurrences"
                          required
                          value={quizTopic}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1" htmlFor="quiz-count">
                          Question count
                        </label>
                        <Input
                          id="quiz-count"
                          max={20}
                          min={1}
                          onChange={(event) => setQuestionCount(Number(event.target.value))}
                          type="number"
                          value={questionCount}
                        />
                      </div>
                      {(role === "professor" || role === "administrator") && (
                        <div className="space-y-3 border-t pt-3">
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1" htmlFor="quiz-course">
                              Course (optional)
                            </label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              id="quiz-course"
                              onChange={(event) => setQuizCourseId(event.target.value)}
                              value={quizCourseId}
                            >
                              <option value="">Personal quiz</option>
                              {courses.map((course) => (
                                <option key={course.id} value={course.id}>
                                  {course.code} · {course.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              checked={quizPublished}
                              onChange={(event) => setQuizPublished(event.target.checked)}
                              type="checkbox"
                              className="accent-primary size-3.5"
                            />
                            <span>Publish this quiz to enrolled students</span>
                          </label>
                        </div>
                      )}
                      <Button className="w-full gap-2" type="submit">
                        <Sparkles className="size-3.5" />
                        Generate quiz
                      </Button>
                    </form>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
