"use client";

import { useAuth } from "@clerk/nextjs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Sparkles,
  Calendar,
  CheckCircle2,
  Trash2,
  BrainCircuit,
  BookOpenText,
  Clock,
  Play,
  Award,
  ListTodo,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { apiFetch, apiRequest } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { PageHeader } from "@/components/page-header";
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
      completed: z.boolean().default(false),
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
  assessment_type: z.enum(["practice", "mock_exam"]),
  duration_minutes: z.number().nullable(),
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
const quizExamAttemptSchema = z.object({
  id: z.string().uuid(),
  started_at: z.string(),
  expires_at: z.string(),
});
const userProfileSchema = z.object({
  role: z.enum(["student", "professor", "administrator"]),
});
const courseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});
const assignmentSubmissionSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  task_title: z.string(),
  course_id: z.string(),
  student_id: z.string(),
  student_email: z.string().nullable(),
  content: z.string(),
  status: z.enum(["submitted", "reviewed"]),
  grade: z.number().nullable(),
  feedback: z.string().nullable(),
  submitted_at: z.string(),
  reviewed_at: z.string().nullable(),
  reviewed_by: z.string().nullable(),
});
const flashcardSchema = z.object({
  front: z.string(),
  back: z.string(),
  hint: z.string(),
});
const lessonSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string(),
  course_id: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  created_at: z.string(),
});
const learningProgressSchema = z.object({
  quiz_attempts: z.number(),
  average_score_percent: z.number().nullable(),
  knowledge_gaps: z.array(
    z.object({
      topic: z.string(),
      missed_questions: z.number(),
    })
  ),
});

type Task = z.infer<typeof taskSchema>;
type StudyPlan = z.infer<typeof studyPlanSchema>;
type Quiz = z.infer<typeof quizSchema>;
type Attempt = z.infer<typeof quizAttemptSchema>;
type Course = z.infer<typeof courseSchema>;
type AssignmentSubmission = z.infer<typeof assignmentSubmissionSchema>;

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The request could not be completed";
}

function localDateString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function subscribeToLocalDate(): () => void {
  return () => {};
}

function getLocalCalendarDate(): string {
  return localDateString(new Date());
}

export default function LearningContent() {
  const { getToken } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [lessons, setLessons] = useState<z.infer<typeof lessonSchema>[]>([]);
  const [progress, setProgress] = useState<z.infer<typeof learningProgressSchema> | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, AssignmentSubmission>>({});
  const [submissionDrafts, setSubmissionDrafts] = useState<Record<string, string>>({});
  const [role, setRole] = useState<"student" | "professor" | "administrator" | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [examAttemptId, setExamAttemptId] = useState<string | null>(null);
  const [examExpiresAt, setExamExpiresAt] = useState<string | null>(null);
  const [examSecondsRemaining, setExamSecondsRemaining] = useState<number | null>(null);
  const [submittingAttempt, setSubmittingAttempt] = useState(false);
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
  const [assessmentType, setAssessmentType] = useState<"practice" | "mock_exam">("practice");
  const [examDurationMinutes, setExamDurationMinutes] = useState(90);
  const [quizCourseId, setQuizCourseId] = useState("");
  const [quizPublished, setQuizPublished] = useState(false);
  const [lessonTopic, setLessonTopic] = useState("");
  const [lessonCourseId, setLessonCourseId] = useState("");
  const [generatingLesson, setGeneratingLesson] = useState(false);
  const [calendarMode, setCalendarMode] = useState<"day" | "week">("week");
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [flashcardTopic, setFlashcardTopic] = useState("");
  const [flashcardCount, setFlashcardCount] = useState(10);
  const [flashcards, setFlashcards] = useState<z.infer<typeof flashcardSchema>[]>([]);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const initialCalendarDate = useSyncExternalStore(
    subscribeToLocalDate,
    getLocalCalendarDate,
    () => null
  );
  const activeCalendarDate = calendarDate ?? initialCalendarDate;
  const selectedCalendarDate = activeCalendarDate
    ? new Date(`${activeCalendarDate}T12:00:00`)
    : null;
  const firstCalendarDate = selectedCalendarDate
    ? new Date(
        selectedCalendarDate.getFullYear(),
        selectedCalendarDate.getMonth(),
        selectedCalendarDate.getDate()
      )
    : null;
  if (calendarMode === "week" && firstCalendarDate) {
    firstCalendarDate.setDate(
      firstCalendarDate.getDate() - ((firstCalendarDate.getDay() + 6) % 7)
    );
  }
  const calendarDays = firstCalendarDate
    ? Array.from(
        { length: calendarMode === "week" ? 7 : 1 },
        (_, index) =>
          localDateString(
            new Date(
              firstCalendarDate.getFullYear(),
              firstCalendarDate.getMonth(),
              firstCalendarDate.getDate() + index
            )
          )
      )
    : [];
  let calendarHeading = "Preparing calendar…";
  if (selectedCalendarDate && calendarMode === "day") {
    calendarHeading = selectedCalendarDate.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } else if (calendarDays.length === 7) {
    calendarHeading = `${new Date(`${calendarDays[0]}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })} – ${new Date(`${calendarDays[6]}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }

  function moveCalendar(direction: -1 | 1) {
    const nextDate = activeCalendarDate
      ? new Date(`${activeCalendarDate}T12:00:00`)
      : new Date();
    nextDate.setDate(nextDate.getDate() + direction * (calendarMode === "week" ? 7 : 1));
    setCalendarDate(localDateString(nextDate));
  }

  const token = useCallback(async () => {
    const value = await getToken();
    if (!value) throw new Error("No active session token was returned");
    return value;
  }, [getToken]);

  const load = useCallback(async () => {
    const accessToken = await token();
    const [taskList, planList, quizList, lessonList, learningProgress, profile, courseList] =
      await Promise.all([
      apiRequest("/api/v1/tasks", z.array(taskSchema), { accessToken }),
      apiRequest("/api/v1/study-plans", z.array(studyPlanSchema), { accessToken }),
      apiRequest("/api/v1/quizzes", z.array(quizSchema), { accessToken }),
      apiRequest("/api/v1/lessons", z.array(lessonSchema), { accessToken }),
      apiRequest("/api/v1/learning/progress", learningProgressSchema, { accessToken }),
      apiRequest("/api/v1/users/me", userProfileSchema, { accessToken }),
      apiRequest("/api/v1/courses", z.array(courseSchema), { accessToken }),
      ]);
    setTasks(taskList);
    setPlans(planList);
    setQuizzes(quizList);
    setLessons(lessonList);
    setProgress(learningProgress);
    setRole(profile.role);
    setCourses(courseList);
    setQuizCourseId((selected) => selected || courseList[0]?.id || "");
    setLessonCourseId((selected) => selected || courseList[0]?.id || "");
    const submissionList = profile.role === "student"
      ? await apiRequest(
          "/api/v1/tasks/submissions/mine",
          z.array(assignmentSubmissionSchema),
          { accessToken }
        )
      : [];
    setSubmissions(Object.fromEntries(submissionList.map((submission) => [submission.task_id, submission])));
  }, [token]);

  async function activateQuiz(quiz: Quiz) {
    setActiveQuiz(quiz);
    setAnswers({});
    setAttempt(null);
    setExamAttemptId(null);
    setExamExpiresAt(null);
    setExamSecondsRemaining(null);
    if (quiz.assessment_type === "mock_exam") {
      try {
        const accessToken = await token();
        const started = await apiRequest(
          `/api/v1/quizzes/${quiz.id}/attempts/start`,
          quizExamAttemptSchema,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
            accessToken,
          }
        );
        setExamAttemptId(started.id);
        setExamExpiresAt(started.expires_at);
      } catch (cause) {
        const err = message(cause);
        setError(err);
        toast.error(err);
      }
    }
  }

  const submitQuizAnswers = useCallback(async () => {
    if (!activeQuiz || submittingAttempt) return;
    setError(null);
    setSubmittingAttempt(true);
    try {
      const accessToken = await token();
      const result = await apiRequest(
        `/api/v1/quizzes/${activeQuiz.id}/attempts`,
        quizAttemptSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers,
            ...(activeQuiz.assessment_type === "mock_exam"
              ? { attempt_id: examAttemptId }
              : {}),
          }),
          accessToken,
        }
      );
      setAttempt(result);
      setExamAttemptId(null);
      toast.success(`Quiz completed! Score: ${result.score} / ${result.total_points}`);
      await load();
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    } finally {
      setSubmittingAttempt(false);
    }
  }, [activeQuiz, answers, examAttemptId, load, submittingAttempt, token]);

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

  useEffect(() => {
    if (!examExpiresAt || attempt) return;
    const updateRemaining = () => {
      setExamSecondsRemaining(
        Math.max(0, Math.ceil((Date.parse(examExpiresAt) - Date.now()) / 1000))
      );
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [attempt, examExpiresAt]);

  useEffect(() => {
    if (
      examSecondsRemaining === 0 &&
      examAttemptId &&
      !attempt &&
      !submittingAttempt
    ) {
      const timeout = window.setTimeout(() => {
        void submitQuizAnswers();
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [
    attempt,
    examAttemptId,
    examSecondsRemaining,
    submittingAttempt,
    submitQuizAnswers,
  ]);

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

  async function setStudyBlockCompletion(
    plan: StudyPlan,
    blockIndex: number,
    completed: boolean
  ) {
    setError(null);
    try {
      const accessToken = await token();
      const schedule = plan.schedule.map((block, index) =>
        index === blockIndex ? { ...block, completed } : block
      );
      const updated = await apiRequest(
        `/api/v1/study-plans/${plan.id}`,
        studyPlanSchema,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schedule }),
          accessToken,
        }
      );
      setPlans((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      toast.success(completed ? "Study block completed" : "Study block reopened");
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function reschedulePlan(plan: StudyPlan) {
    setError(null);
    try {
      const accessToken = await token();
      const updated = await apiRequest(
        `/api/v1/study-plans/${plan.id}/reschedule`,
        studyPlanSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            available_minutes_per_day: dailyCapacity,
          }),
          accessToken,
        }
      );
      setPlans((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setNotice(updated.summary ?? "Study plan rescheduled.");
      toast.success("Overdue study blocks rescheduled where capacity allowed.");
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault();
    setError(null);
    try {
      const accessToken = await token();
      const submission = await apiRequest(
        `/api/v1/tasks/${task.id}/submissions`,
        assignmentSubmissionSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: submissionDrafts[task.id] ?? "" }),
          accessToken,
        }
      );
      setSubmissions((current) => ({ ...current, [task.id]: submission }));
      setSubmissionDrafts((current) => ({ ...current, [task.id]: submission.content }));
      setNotice("Assignment submitted for review.");
      toast.success("Assignment submitted for review.");
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
          assessment_type: assessmentType,
          duration_minutes:
            assessmentType === "mock_exam" ? examDurationMinutes : null,
        }),
        accessToken,
      });
      await activateQuiz(quiz);
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

  async function generateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setGeneratingLesson(true);
    try {
      const accessToken = await token();
      const lesson = await apiRequest(
        "/api/v1/lessons/generate",
        lessonSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: lessonTopic,
            course_id: lessonCourseId || null,
          }),
          accessToken,
        }
      );
      setLessons((current) => [lesson, ...current]);
      setLessonTopic("");
      setNotice("AI lesson generated and saved to your Learning Studio.");
      toast.success("AI lesson generated and saved.");
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    } finally {
      setGeneratingLesson(false);
    }
  }

  async function generateFlashcards(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setGeneratingFlashcards(true);
    try {
      const accessToken = await token();
      const generated = await apiRequest(
        "/api/v1/flashcards/generate",
        z.array(flashcardSchema),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: flashcardTopic,
            card_count: flashcardCount,
            course_id: quizCourseId || null,
          }),
          accessToken,
        }
      );
      setFlashcards(generated);
      setFlashcardIndex(0);
      setFlashcardFlipped(false);
      setFlashcardTopic("");
      setNotice(`${generated.length} flashcards generated.`);
      toast.success(`${generated.length} flashcards generated.`);
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    } finally {
      setGeneratingFlashcards(false);
    }
  }

  async function submitQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitQuizAnswers();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
        <PageHeader
          title="Learning Studio"
          description="Adaptive revision plans, assignment deadlines, and practice quizzes for ISI Kef coursework"
        />

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
              <Skeleton className="h-64 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
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
              <TabsTrigger value="calendar" className="gap-1.5">
                <Calendar className="size-3.5" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="lessons" className="gap-1.5">
                <BookOpenText className="size-3.5" />
                Lessons
                {lessons.length > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{lessons.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="progress" className="gap-1.5">
                <Award className="size-3.5" />
                Progress
              </TabsTrigger>
              <TabsTrigger value="quizzes" className="gap-1.5">
                <BrainCircuit className="size-3.5" />
                Learning Studio & Quizzes
                {quizzes.length > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{quizzes.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="flashcards" className="gap-1.5">
                <Sparkles className="size-3.5" /> Flashcards
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calendar" className="mt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    aria-label="Previous calendar period"
                    onClick={() => moveCalendar(-1)}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    aria-label="Next calendar period"
                    onClick={() => moveCalendar(1)}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                  <h2 className="ml-1 text-sm font-semibold">{calendarHeading}</h2>
                </div>
                <div className="flex gap-2">
                  <Button
                    aria-pressed={calendarMode === "day"}
                    onClick={() => setCalendarMode("day")}
                    size="xs"
                    type="button"
                    variant={calendarMode === "day" ? "default" : "outline"}
                  >
                    Day
                  </Button>
                  <Button
                    aria-pressed={calendarMode === "week"}
                    onClick={() => setCalendarMode("week")}
                    size="xs"
                    type="button"
                    variant={calendarMode === "week" ? "default" : "outline"}
                  >
                    Week
                  </Button>
                </div>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Calendar entries come from saved task deadlines and active study-plan schedules. Use a plan action to explicitly reschedule overdue blocks.
              </p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {calendarDays.map((day) => {
                  const dueTasks = tasks.filter(
                    (task) => task.due_at && localDateString(new Date(task.due_at)) === day
                  );
                  const studyBlocks = plans.flatMap((plan) =>
                    plan.status === "active"
                      ? plan.schedule
                          .map((block, index) => ({ block, index, plan }))
                          .filter(({ block }) => block.day === day)
                      : []
                  );
                  return (
                    <Card className="min-h-40 p-4" key={day}>
                      <h3 className="mb-3 text-sm font-semibold">
                        {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                        })}
                      </h3>
                      <ul className="space-y-2">
                        {dueTasks.map((task) => {
                          if (!task.due_at) return null;
                          return (
                            <li
                              className="rounded-md border bg-muted/20 p-2.5 text-xs"
                              key={`task-${task.id}`}
                            >
                              <p className="font-medium">{task.title}</p>
                              <p className="mt-1 text-muted-foreground">
                                Due {new Date(task.due_at).toLocaleTimeString(undefined, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })} · {task.status.replace("_", " ")}
                              </p>
                            </li>
                          );
                        })}
                        {studyBlocks.map(({ block, index, plan }) => (
                          <li
                            className="rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs"
                            key={`plan-${plan.id}-${index}`}
                          >
                            <p className="font-medium">{block.topic}</p>
                            <p className="mt-1 text-muted-foreground">
                              {plan.title} · {block.duration_minutes} min
                            </p>
                          </li>
                        ))}
                        {dueTasks.length === 0 && studyBlocks.length === 0 && (
                          <li className="text-xs text-muted-foreground">Nothing scheduled</li>
                        )}
                      </ul>
                    </Card>
                  );
                })}
              </div>
              {calendarDays.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground" role="status">
                  Preparing your saved schedule…
                </p>
              )}
            </TabsContent>

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
                        <Card className="p-4">
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
                          {role === "student" && task.owner_id === null && task.course_id && (
                            <div className="mt-4 border-t pt-4">
                              {submissions[task.id] && (
                                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                                  <Badge variant={submissions[task.id].status === "reviewed" ? "secondary" : "outline"}>
                                    {submissions[task.id].status === "reviewed" ? "Reviewed" : "Awaiting review"}
                                  </Badge>
                                  {submissions[task.id].grade !== null && (
                                    <span className="font-medium">Grade: {submissions[task.id].grade}/100</span>
                                  )}
                                  <span className="text-muted-foreground">
                                    Submitted {new Date(submissions[task.id].submitted_at).toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {submissions[task.id]?.feedback && (
                                <p className="mb-3 rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
                                  <span className="font-semibold">Professor feedback: </span>
                                  {submissions[task.id].feedback}
                                </p>
                              )}
                              <form className="space-y-2" onSubmit={(event) => void submitAssignment(event, task)}>
                                <label className="block text-xs font-medium" htmlFor={`submission-${task.id}`}>
                                  Assignment response
                                </label>
                                <Textarea
                                  className="min-h-24 text-xs"
                                  id={`submission-${task.id}`}
                                  maxLength={20000}
                                  onChange={(event) => setSubmissionDrafts((current) => ({
                                    ...current,
                                    [task.id]: event.target.value,
                                  }))}
                                  required
                                  value={submissionDrafts[task.id] ?? submissions[task.id]?.content ?? ""}
                                />
                                <Button size="xs" type="submit">
                                  {submissions[task.id] ? "Resubmit assignment" : "Submit assignment"}
                                </Button>
                              </form>
                            </div>
                          )}
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
                  <Card className="p-5 sticky top-20">
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
                        <Card className="p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <CardTitle className="text-base font-semibold">{plan.title}</CardTitle>
                            <Button
                              disabled={plan.status !== "active"}
                              onClick={() => void reschedulePlan(plan)}
                              size="xs"
                              type="button"
                              variant="outline"
                            >
                              Reschedule overdue blocks
                            </Button>
                          </div>
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
                                {                                plan.schedule.map((block, index) => (
                                  <li
                                    key={`${block.day}-${block.topic}-${index}`}
                                    className={`text-xs border rounded-lg p-2.5 bg-card/60 ${block.completed ? "opacity-60" : ""}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <span className={`font-semibold text-foreground ${block.completed ? "line-through" : ""}`}>{block.day} · {block.topic}</span>
                                        {block.completed && (
                                          <Badge className="ml-2" variant="secondary">Completed</Badge>
                                        )}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <Badge variant="outline" className="text-[10px]">
                                          {block.duration_minutes} min
                                        </Badge>
                                        <Button
                                          aria-label={`${block.completed ? "Reopen" : "Complete"} ${block.topic} study block`}
                                          onClick={() =>
                                            void setStudyBlockCompletion(plan, index, !block.completed)
                                          }
                                          size="xs"
                                          type="button"
                                          variant="ghost"
                                        >
                                          {block.completed ? "Reopen" : "Complete"}
                                        </Button>
                                      </div>
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
                  <Card className="p-5">
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

            <TabsContent value="lessons" className="mt-6">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold text-foreground">Saved AI lessons</h2>
                  {lessons.length === 0 ? (
                    <EmptyState
                      icon={BookOpenText}
                      title="No lessons yet"
                      description="Generate a lesson to save it alongside your quizzes and study plans."
                    />
                  ) : (
                    <ul className="space-y-3">
                      {lessons.map((lesson) => (
                        <li key={lesson.id}>
                          <Card className="p-5">
                            <CardTitle className="text-base font-semibold">{lesson.title}</CardTitle>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Saved {new Date(lesson.created_at).toLocaleString()}
                            </p>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                              {lesson.content}
                            </p>
                          </Card>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <Card className="h-fit p-5">
                  <CardTitle className="text-base font-semibold">Generate a lesson</CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    Create a focused explanation and keep it in your personal learning library.
                  </CardDescription>
                  <form className="mt-4 space-y-3" onSubmit={generateLesson}>
                    <div>
                      <label className="mb-1 block text-xs font-medium" htmlFor="lesson-topic">
                        Topic
                      </label>
                      <Textarea
                        id="lesson-topic"
                        maxLength={1000}
                        minLength={3}
                        onChange={(event) => setLessonTopic(event.target.value)}
                        placeholder="e.g. Dijkstra's shortest-path algorithm"
                        required
                        value={lessonTopic}
                        className="min-h-24 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium" htmlFor="lesson-course">
                        Course context
                      </label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        id="lesson-course"
                        onChange={(event) => setLessonCourseId(event.target.value)}
                        value={lessonCourseId}
                      >
                        <option value="">General study</option>
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.code} · {course.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button className="w-full" disabled={generatingLesson} type="submit">
                      {generatingLesson ? "Generating…" : "Generate & save lesson"}
                    </Button>
                  </form>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="progress" className="mt-6">
              <div className="grid gap-5 md:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.3fr)]">
                <Card className="p-5">
                  <CardTitle className="text-base font-semibold">Quiz practice</CardTitle>
                  <p className="mt-3 text-3xl font-semibold">
                    {progress?.average_score_percent === null || progress?.average_score_percent === undefined
                      ? "—"
                      : `${progress.average_score_percent.toFixed(0)}%`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Average score across your saved attempts</p>
                  <Badge className="mt-4" variant="secondary">
                    {progress?.quiz_attempts ?? 0} completed attempt{progress?.quiz_attempts === 1 ? "" : "s"}
                  </Badge>
                </Card>
                <Card className="p-5">
                  <CardTitle className="text-base font-semibold">Topics to revisit</CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    Based on incorrect or unanswered items in your saved quiz attempts.
                  </CardDescription>
                  {progress && progress.knowledge_gaps.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {progress.knowledge_gaps.map((gap) => (
                        <li
                          className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3 text-sm"
                          key={gap.topic}
                        >
                          <span className="font-medium">{gap.topic}</span>
                          <Badge variant="outline">
                            {gap.missed_questions} missed
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Complete a practice quiz to see which topics may need more review.
                    </p>
                  )}
                  {!!progress?.knowledge_gaps.length && (
                    <figure className="mt-5 border-t pt-4">
                      <figcaption className="mb-2 text-xs font-medium text-muted-foreground">
                        Missed questions by topic
                      </figcaption>
                      <div aria-label="Chart of missed quiz questions by topic" role="img">
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart
                            data={progress.knowledge_gaps.slice(0, 8)}
                            layout="vertical"
                            margin={{ left: 8, right: 12, top: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis allowDecimals={false} type="number" />
                            <YAxis
                              dataKey="topic"
                              type="category"
                              width={110}
                              tick={{ fontSize: 11 }}
                            />
                            <Tooltip />
                            <Bar
                              dataKey="missed_questions"
                              fill="var(--color-primary)"
                              name="Missed questions"
                              radius={[0, 4, 4, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </figure>
                  )}
                </Card>
              </div>
            </TabsContent>

            {/* Quizzes Tab */}
            <TabsContent value="quizzes" className="mt-6">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                {/* Active Quiz Area & Saved Quizzes */}
                <div className="space-y-6">
                  {activeQuiz ? (
                    <Card className="p-6">
                      <form className="space-y-6" onSubmit={submitQuiz}>
                        <div>
                          <Badge variant="outline" className="mb-2">
                            {activeQuiz.assessment_type === "mock_exam" ? "Mock Exam" : "Practice Quiz"}
                          </Badge>
                          <h3 className="text-xl font-semibold text-foreground">{activeQuiz.title}</h3>
                          {activeQuiz.assessment_type === "mock_exam" && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {examSecondsRemaining !== null
                                ? `Time remaining: ${Math.floor(examSecondsRemaining / 60)}:${String(examSecondsRemaining % 60).padStart(2, "0")}`
                                : examAttemptId
                                  ? "Timed attempt in progress."
                                  : "Starting timed attempt…"}{" "}
                              Answers and explanations are shown after submission.
                            </p>
                          )}
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
                                    disabled={
                                      submittingAttempt ||
                                      Boolean(attempt) ||
                                      (activeQuiz.assessment_type === "mock_exam" &&
                                        (!examAttemptId || examSecondsRemaining === 0))
                                    }
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

                        <Button
                          className="w-full"
                          disabled={
                            submittingAttempt ||
                            Boolean(attempt) ||
                            (activeQuiz.assessment_type === "mock_exam" &&
                              !examAttemptId)
                          }
                          type="submit"
                        >
                          {submittingAttempt ? "Submitting…" : "Submit answers"}
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
                    <h3 className="text-lg font-semibold text-foreground mb-4">Saved assessments</h3>
                    <ul className="space-y-3">
                      {quizzes.map((quiz) => (
                        <li key={quiz.id}>
                          <Card className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm text-foreground">{quiz.title}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {quiz.assessment_type === "mock_exam" ? "Mock exam" : "Practice quiz"}
                                {quiz.duration_minutes ? ` · ${quiz.duration_minutes} min` : ""}
                                {" · "}{quiz.questions.length} questions · {new Date(quiz.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void activateQuiz(quiz)}
                              type="button"
                              className="gap-1.5"
                            >
                              <Play className="size-3.5" />
                              {quiz.assessment_type === "mock_exam" ? "Start exam" : "Practice"}
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
                  <Card className="p-5 sticky top-20">
                    <CardTitle className="text-base font-semibold">Generate a quiz</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      AI crafts targeted multiple-choice questions with instant scoring.
                    </CardDescription>

                    <form className="mt-4 space-y-3" onSubmit={generateQuiz}>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1" htmlFor="assessment-type">
                          Assessment type
                        </label>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          id="assessment-type"
                          onChange={(event) =>
                            setAssessmentType(event.target.value as "practice" | "mock_exam")
                          }
                          value={assessmentType}
                        >
                          <option value="practice">Practice quiz</option>
                          <option value="mock_exam">Mock exam</option>
                        </select>
                      </div>
                      {assessmentType === "mock_exam" && (
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1" htmlFor="exam-duration">
                            Suggested duration (minutes)
                          </label>
                          <Input
                            id="exam-duration"
                            max={240}
                            min={5}
                            onChange={(event) => setExamDurationMinutes(Number(event.target.value))}
                            required
                            type="number"
                            value={examDurationMinutes}
                          />
                        </div>
                      )}
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

            <TabsContent value="flashcards" className="mt-6">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <section aria-label="Flashcard review" className="min-w-0">
                  {flashcards.length > 0 ? (
                    <div className="mx-auto max-w-2xl">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">
                          Card {flashcardIndex + 1} of {flashcards.length}
                        </p>
                        <Button
                          aria-label="Restart flashcard review"
                          onClick={() => {
                            setFlashcardIndex(0);
                            setFlashcardFlipped(false);
                          }}
                          size="xs"
                          type="button"
                          variant="ghost"
                        >
                          <RotateCcw className="size-3.5" /> Restart
                        </Button>
                      </div>
                      <button
                        aria-label={flashcardFlipped ? "Show flashcard front" : "Reveal flashcard answer"}
                        className="relative h-72 w-full rounded-lg border bg-card p-6 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setFlashcardFlipped((flipped) => !flipped)}
                        style={{ perspective: "1000px" }}
                        type="button"
                      >
                        <span
                          className="absolute inset-0 flex flex-col justify-center rounded-lg p-6 transition-transform duration-500"
                          style={{
                            transform: flashcardFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                            transformStyle: "preserve-3d",
                            backfaceVisibility: "hidden",
                          }}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prompt</span>
                          <span className="mt-3 text-xl font-semibold leading-relaxed">{flashcards[flashcardIndex].front}</span>
                          <span className="mt-6 text-xs text-muted-foreground">Select to reveal the answer</span>
                        </span>
                        <span
                          className="absolute inset-0 flex flex-col justify-center rounded-lg bg-muted/50 p-6 transition-transform duration-500"
                          style={{
                            transform: flashcardFlipped ? "rotateY(0deg)" : "rotateY(-180deg)",
                            transformStyle: "preserve-3d",
                            backfaceVisibility: "hidden",
                          }}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Answer</span>
                          <span className="mt-3 text-lg font-medium leading-relaxed">{flashcards[flashcardIndex].back}</span>
                          {flashcards[flashcardIndex].hint && (
                            <span className="mt-5 border-t pt-3 text-sm text-muted-foreground">
                              Hint: {flashcards[flashcardIndex].hint}
                            </span>
                          )}
                        </span>
                      </button>
                      <div className="mt-4 flex justify-between">
                        <Button
                          disabled={flashcardIndex === 0}
                          onClick={() => {
                            setFlashcardIndex((index) => index - 1);
                            setFlashcardFlipped(false);
                          }}
                          type="button"
                          variant="outline"
                        ><ChevronLeft className="size-4" /> Previous</Button>
                        <Button
                          disabled={flashcardIndex === flashcards.length - 1}
                          onClick={() => {
                            setFlashcardIndex((index) => index + 1);
                            setFlashcardFlipped(false);
                          }}
                          type="button"
                        >Next <ChevronRight className="size-4" /></Button>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Sparkles}
                      title="No flashcards to review"
                      description="Generate a set from a topic or course materials."
                    />
                  )}
                </section>

                <Card className="p-5">
                  <CardTitle className="text-base font-semibold">Generate flashcards</CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    Build a review set from your topic and accessible course knowledge.
                  </CardDescription>
                  <form className="mt-4 space-y-3" onSubmit={generateFlashcards}>
                    <div>
                      <label className="mb-1 block text-xs font-medium" htmlFor="flashcard-topic">Topic</label>
                      <Input
                        id="flashcard-topic"
                        maxLength={1000}
                        minLength={3}
                        onChange={(event) => setFlashcardTopic(event.target.value)}
                        placeholder="e.g. Graph traversal algorithms"
                        required
                        value={flashcardTopic}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium" htmlFor="flashcard-count">Card count</label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        id="flashcard-count"
                        onChange={(event) => setFlashcardCount(Number(event.target.value))}
                        value={flashcardCount}
                      >
                        {[5, 10, 15, 20, 25, 30].map((count) => (
                          <option key={count} value={count}>{count} cards</option>
                        ))}
                      </select>
                    </div>
                    {courses.length > 0 && (
                      <div>
                        <label className="mb-1 block text-xs font-medium" htmlFor="flashcard-course">Course context</label>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          id="flashcard-course"
                          onChange={(event) => setQuizCourseId(event.target.value)}
                          value={quizCourseId}
                        >
                          <option value="">All courses</option>
                          {courses.map((course) => (
                            <option key={course.id} value={course.id}>{course.code} · {course.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <Button className="w-full gap-2" disabled={generatingFlashcards} type="submit">
                      <Sparkles className="size-3.5" />
                      {generatingFlashcards ? "Generating…" : "Generate flashcards"}
                    </Button>
                  </form>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
