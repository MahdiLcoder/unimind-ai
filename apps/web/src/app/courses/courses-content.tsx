"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  BookOpen,
  PlusCircle,
  Search,
  Users,
  Layers,
  ArrowRight,
  TrendingUp,
  FileText,
  Upload,
  Trash2,
} from "lucide-react";
import { apiFetch, apiRequest } from "@/lib/api";
import { validateUploadFile } from "@/lib/upload";
import { SiteHeader } from "@/components/site-header";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";

const profileSchema = z.object({
  clerk_user_id: z.string(),
  email: z.string().nullable(),
  role: z.enum(["student", "professor", "administrator"]),
  created_at: z.string(),
});
const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_by: z.string(),
  created_at: z.string(),
});
const courseSchema = z.object({
  id: z.string(),
  workspace_id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  professor_id: z.string(),
  created_at: z.string(),
});
const enrollmentSchema = z.object({
  course_id: z.string(),
  student_id: z.string(),
  status: z.string(),
  enrolled_at: z.string(),
});
const rosterEnrollmentSchema = enrollmentSchema.extend({
  email: z.string().nullable(),
  completed_tasks_count: z.number(),
  average_quiz_score: z.number().nullable(),
});
const courseDocumentSchema = z.object({
  id: z.string().uuid(),
  source_filename: z.string(),
  title: z.string().nullable(),
  course_id: z.string().nullable(),
  created_at: z.string(),
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
const uploadResponseSchema = z.object({
  id: z.string().uuid(),
  source_filename: z.string(),
  status: z.string(),
});
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
const overviewSchema = z.object({
  course_id: z.string(),
  active_students: z.number(),
  assignments: z.number(),
  assignment_completions: z.number(),
  quiz_attempts: z.number(),
  average_quiz_score_percent: z.number().nullable(),
  pending_submissions_count: z.number(),
});

type Course = z.infer<typeof courseSchema>;
type Workspace = z.infer<typeof workspaceSchema>;
type Role = z.infer<typeof profileSchema>["role"];
type Overview = z.infer<typeof overviewSchema>;

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The request could not be completed";
}

export default function CoursesContent() {
  const { getToken } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [courseWorkspace, setCourseWorkspace] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseDocuments, setCourseDocuments] = useState<z.infer<typeof courseDocumentSchema>[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, z.infer<typeof assignmentSubmissionSchema>[]>>({});
  const [reviewFeedback, setReviewFeedback] = useState<Record<string, string>>({});
  const [reviewGrades, setReviewGrades] = useState<Record<string, string>>({});
  const [materialCourseId, setMaterialCourseId] = useState("");
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [assignmentTitles, setAssignmentTitles] = useState<Record<string, string>>({});
  const [assignmentDues, setAssignmentDues] = useState<Record<string, string>>({});
  const [rosters, setRosters] = useState<Record<string, z.infer<typeof rosterEnrollmentSchema>[]>>({});
  const materialFileInput = useRef<HTMLInputElement>(null);
  const [overviews, setOverviews] = useState<Record<string, Overview>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("No active session token was returned");
    const [profile, courseList, workspaceList, documentList] = await Promise.all([
      apiRequest("/api/v1/users/me", profileSchema, { accessToken: token }),
      apiRequest("/api/v1/courses", z.array(courseSchema), { accessToken: token }),
      apiRequest("/api/v1/workspaces", z.array(workspaceSchema), { accessToken: token }),
      apiRequest("/api/v1/documents", z.array(courseDocumentSchema), { accessToken: token }),
    ]);
    setRole(profile.role);
    setCourses(courseList);
    setWorkspaces(workspaceList);
    setCourseDocuments(documentList.filter((document) => document.course_id !== null));
    setMaterialCourseId((selected) => selected || courseList[0]?.id || "");
    setCourseWorkspace((selected) => selected || workspaceList[0]?.id || "");
  }, [getToken]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(load)
      .catch((cause: unknown) => {
        if (active) {
          const err = errorMessage(cause);
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

  async function accessToken(): Promise<string> {
    const token = await getToken();
    if (!token) throw new Error("No active session token was returned");
    return token;
  }

  async function searchCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const token = await accessToken();
      const query = new URLSearchParams({ query: catalogQuery.trim() });
      const result = await apiRequest(
        `/api/v1/courses/catalog?${query}`,
        z.array(courseSchema),
        { accessToken: token }
      );
      setCatalog(result);
      toast.info(`Found ${result.length} courses`);
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const token = await accessToken();
      await apiRequest("/api/v1/workspaces", workspaceSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName }),
        accessToken: token,
      });
      setWorkspaceName("");
      setNotice("Workspace created.");
      toast.success("Workspace created successfully.");
      await load();
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      if (!courseWorkspace) throw new Error("Create a workspace before adding a course");
      const token = await accessToken();
      await apiRequest(
        `/api/v1/workspaces/${courseWorkspace}/courses`,
        courseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: courseCode, name: courseName }),
          accessToken: token,
        }
      );
      setCourseCode("");
      setCourseName("");
      setNotice("Course created.");
      toast.success("Course created successfully.");
      await load();
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function enroll(course: Course) {
    setError(null);
    try {
      const token = await accessToken();
      await apiRequest(
        `/api/v1/courses/${course.id}/enrollment`,
        enrollmentSchema,
        { method: "POST", accessToken: token }
      );
      const msg = `Enrolled in ${course.code}.`;
      setNotice(msg);
      toast.success(msg);
      await load();
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function showRoster(course: Course) {
    setError(null);
    try {
      const token = await accessToken();
      const roster = await apiRequest(
        `/api/v1/courses/${course.id}/enrollments`,
        z.array(rosterEnrollmentSchema),
        { accessToken: token }
      );
      setRosters((current) => ({
        ...current,
        [course.id]: roster,
      }));
      toast.info(`Loaded roster for ${course.code}`);
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function uploadCourseMaterial(file: File) {
    const validationError = validateUploadFile(file);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      if (materialFileInput.current) materialFileInput.current.value = "";
      return;
    }
    setUploadingMaterial(true);
    setError(null);
    try {
      if (!materialCourseId) throw new Error("Create or select a course before uploading materials");
      const token = await accessToken();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("course_id", materialCourseId);
      await apiRequest("/api/v1/documents", uploadResponseSchema, {
        method: "POST",
        body: formData,
        accessToken: token,
        timeoutMs: 180_000,
      });
      await load();
      toast.success(`Uploaded ${file.name} to course materials`);
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    } finally {
      setUploadingMaterial(false);
      if (materialFileInput.current) materialFileInput.current.value = "";
    }
  }

  async function deleteCourseMaterial(document: z.infer<typeof courseDocumentSchema>) {
    setError(null);
    try {
      const token = await accessToken();
      const response = await apiFetch(`/api/v1/documents/${document.id}`, {
        method: "DELETE",
        accessToken: token,
      });
      if (!response.ok) throw new Error(`Could not delete document (${response.status})`);
      setCourseDocuments((current) => current.filter((item) => item.id !== document.id));
      toast.success(`Deleted ${document.source_filename}`);
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function showOverview(course: Course) {
    setError(null);
    try {
      const token = await accessToken();
      const overview = await apiRequest(
        `/api/v1/courses/${course.id}/learning-overview`,
        overviewSchema,
        { accessToken: token }
      );
      setOverviews((current) => ({ ...current, [course.id]: overview }));
      toast.info(`Loaded analytics for ${course.code}`);
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function showSubmissions(course: Course) {
    setError(null);
    try {
      const token = await accessToken();
      const result = await apiRequest(
        `/api/v1/courses/${course.id}/submissions?status=submitted`,
        z.array(assignmentSubmissionSchema),
        { accessToken: token }
      );
      setSubmissions((current) => ({ ...current, [course.id]: result }));
      toast.info(`Loaded ${result.length} submissions awaiting review`);
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function reviewSubmission(
    event: FormEvent<HTMLFormElement>,
    course: Course,
    submission: z.infer<typeof assignmentSubmissionSchema>
  ) {
    event.preventDefault();
    setError(null);
    try {
      const token = await accessToken();
      const gradeText = reviewGrades[submission.id];
      const reviewed = await apiRequest(
        `/api/v1/courses/${course.id}/submissions/${submission.id}`,
        assignmentSubmissionSchema,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedback: reviewFeedback[submission.id] || null,
            grade: gradeText ? Number(gradeText) : null,
          }),
          accessToken: token,
        }
      );
      setSubmissions((current) => ({
        ...current,
        [course.id]: (current[course.id] ?? []).filter((item) => item.id !== reviewed.id),
      }));
      toast.success(`Reviewed ${submission.task_title}`);
      await showOverview(course);
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>, course: Course) {
    event.preventDefault();
    setError(null);
    try {
      const token = await accessToken();
      const due = assignmentDues[course.id];
      await apiRequest(`/api/v1/courses/${course.id}/tasks`, taskSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: assignmentTitles[course.id],
          due_at: due ? new Date(due).toISOString() : null,
        }),
        accessToken: token,
      });
      setAssignmentTitles((current) => ({ ...current, [course.id]: "" }));
      setAssignmentDues((current) => ({ ...current, [course.id]: "" }));
      const msg = `Assignment created for ${course.code}.`;
      setNotice(msg);
      toast.success(msg);
    } catch (cause) {
      const err = errorMessage(cause);
      setError(err);
      toast.error(err);
    }
  }

  const canManageCourses = role === "professor" || role === "administrator";

  const displayedCourses = courses.filter((c) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (c.description?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
        <PageHeader
          title="Courses & Modules"
          description="ISI Kef academic workspace enrollments, syllabus indexing, and course assignments"
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
            <p className="sr-only">Loading your courses…</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-44 w-full rounded-lg" />
              <Skeleton className="h-44 w-full rounded-lg" />
            </div>
          </div>
        ) : (
          <Tabs defaultValue="courses" className="mt-8">
            <TabsList className="h-9">
              <TabsTrigger value="courses">
                {canManageCourses ? "Your courses" : "Enrolled courses"}
              </TabsTrigger>
              {role === "student" && <TabsTrigger value="catalog">Browse Catalog</TabsTrigger>}
              {canManageCourses && <TabsTrigger value="materials">Course Materials</TabsTrigger>}
              {canManageCourses && <TabsTrigger value="manage">Manage Workspaces & Courses</TabsTrigger>}
            </TabsList>

            {/* Courses Tab */}
            <TabsContent value="courses" className="mt-6">
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-foreground">
                    {canManageCourses ? "Your courses" : "Enrolled courses"}
                  </h2>
                  <Badge variant="secondary">
                    {courses.length} {courses.length === 1 ? "Course" : "Courses"}
                  </Badge>
                </div>

                {courses.length === 0 && (
                  <EmptyState
                    icon={BookOpen}
                    title="No courses yet"
                    description="No courses are linked to your account yet. Browse the catalog to enroll."
                  />
                )}

                {courses.length > 0 && (
                  <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Filter courses by code, title, or description…"
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      className="pl-9 text-xs"
                    />
                  </div>
                )}

                {courses.length > 0 && displayedCourses.length === 0 && (
                  <p className="rounded-lg bg-muted/40 p-6 text-center text-xs text-muted-foreground border">
                    No courses match &quot;{filterQuery}&quot;.
                  </p>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  {displayedCourses.map((course) => (
                    <Card key={course.id} className="flex flex-col justify-between">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="font-mono text-xs">
                            {course.code}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            Active
                          </Badge>
                        </div>
                        <CardTitle className="mt-2 text-lg font-semibold">{course.name}</CardTitle>
                        {course.description && (
                          <CardDescription className="text-xs leading-relaxed">
                            {course.description}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Link
                          className={buttonVariants({ variant: "outline", size: "sm", className: "w-full justify-between" })}
                          href={`/workspace?course=${encodeURIComponent(course.id)}`}
                        >
                          <span>Open course workspace</span>
                          <ArrowRight className="size-3.5" />
                        </Link>

                        {canManageCourses && (
                          <div className="border-t pt-4 space-y-3">
                            <form
                              className="grid gap-2 rounded-lg border bg-muted/20 p-3"
                              onSubmit={(event) => void createAssignment(event, course)}
                            >
                              <h4 className="text-xs font-semibold text-foreground">Create a course assignment</h4>
                              <label className="sr-only" htmlFor={`assignment-title-${course.id}`}>
                                Assignment title for {course.code}
                              </label>
                              <Input
                                className="h-8 text-xs"
                                id={`assignment-title-${course.id}`}
                                maxLength={200}
                                onChange={(event) =>
                                  setAssignmentTitles((current) => ({
                                    ...current,
                                    [course.id]: event.target.value,
                                  }))
                                }
                                placeholder="Assignment title"
                                required
                                value={assignmentTitles[course.id] ?? ""}
                              />
                              <label
                                className="text-[11px] text-muted-foreground"
                                htmlFor={`assignment-due-${course.id}`}
                              >
                                Due date (optional)
                              </label>
                              <Input
                                className="h-8 text-xs"
                                id={`assignment-due-${course.id}`}
                                onChange={(event) =>
                                  setAssignmentDues((current) => ({
                                    ...current,
                                    [course.id]: event.target.value,
                                  }))
                                }
                                type="datetime-local"
                                value={assignmentDues[course.id] ?? ""}
                              />
                              <Button size="xs" variant="secondary" type="submit">
                                Assign to enrolled students
                              </Button>
                            </form>

                            <div className="flex gap-2">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => void showSubmissions(course)}
                                type="button"
                              >
                                Review submissions
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => void showRoster(course)}
                                type="button"
                              >
                                <Users className="size-3 mr-1" />
                                View enrolled students
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => void showOverview(course)}
                                type="button"
                              >
                                <TrendingUp className="size-3 mr-1" />
                                Learning overview
                              </Button>
                            </div>

                            {overviews[course.id] && (
                              <dl className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/10 p-3 text-xs sm:grid-cols-3">
                                <div>
                                  <dt className="text-muted-foreground">Active students</dt>
                                  <dd className="font-semibold text-foreground">{overviews[course.id].active_students}</dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">Assignments</dt>
                                  <dd className="font-semibold text-foreground">{overviews[course.id].assignments}</dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">Completions</dt>
                                  <dd className="font-semibold text-foreground">{overviews[course.id].assignment_completions}</dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">Quiz attempts</dt>
                                  <dd className="font-semibold text-foreground">{overviews[course.id].quiz_attempts}</dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">Average quiz score</dt>
                                  <dd className="font-semibold text-foreground">
                                    {overviews[course.id].average_quiz_score_percent == null
                                      ? "—"
                                      : `${Math.round(overviews[course.id].average_quiz_score_percent ?? 0)}%`}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">Awaiting review</dt>
                                  <dd className="font-semibold text-foreground">
                                    {overviews[course.id].pending_submissions_count}
                                  </dd>
                                </div>
                              </dl>
                            )}

                            {submissions[course.id] && (
                              <section aria-label={`Submissions awaiting review for ${course.code}`} className="space-y-3">
                                <h4 className="text-xs font-semibold">
                                  Submissions awaiting review ({submissions[course.id].length})
                                </h4>
                                {submissions[course.id].map((submission) => (
                                  <article className="rounded-md border p-3" key={submission.id}>
                                    <div className="flex flex-wrap justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-medium">{submission.task_title}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {submission.student_email ?? submission.student_id}
                                          {" · "}{new Date(submission.submitted_at).toLocaleString()}
                                        </p>
                                      </div>
                                      {submission.student_email && (
                                        <p className="max-w-40 break-all font-mono text-[10px] text-muted-foreground">
                                          {submission.student_id}
                                        </p>
                                      )}
                                    </div>
                                    <p className="mt-3 whitespace-pre-wrap rounded bg-muted/30 p-3 text-xs leading-relaxed">
                                      {submission.content}
                                    </p>
                                    <form
                                      className="mt-3 grid gap-2 sm:grid-cols-[1fr_6rem_auto]"
                                      onSubmit={(event) => void reviewSubmission(event, course, submission)}
                                    >
                                      <label className="sr-only" htmlFor={`feedback-${submission.id}`}>
                                        Feedback for {submission.task_title}
                                      </label>
                                      <Textarea
                                        className="min-h-16 text-xs sm:col-span-3"
                                        id={`feedback-${submission.id}`}
                                        maxLength={4000}
                                        onChange={(event) => setReviewFeedback((current) => ({
                                          ...current,
                                          [submission.id]: event.target.value,
                                        }))}
                                        placeholder="Feedback for the student (optional)"
                                        value={reviewFeedback[submission.id] ?? ""}
                                      />
                                      <label className="sr-only" htmlFor={`grade-${submission.id}`}>
                                        Grade out of 100
                                      </label>
                                      <Input
                                        className="h-8 text-xs"
                                        id={`grade-${submission.id}`}
                                        max={100}
                                        min={0}
                                        onChange={(event) => setReviewGrades((current) => ({
                                          ...current,
                                          [submission.id]: event.target.value,
                                        }))}
                                        placeholder="Grade /100"
                                        type="number"
                                        value={reviewGrades[submission.id] ?? ""}
                                      />
                                      <span className="hidden sm:block" />
                                      <Button className="sm:col-start-3" size="xs" type="submit">
                                        Mark reviewed
                                      </Button>
                                    </form>
                                  </article>
                                ))}
                                {submissions[course.id].length === 0 && (
                                  <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                                    No submissions are awaiting review.
                                  </p>
                                )}
                              </section>
                            )}

                            {rosters[course.id] && (
                              <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full min-w-[38rem] text-left text-xs">
                                  <thead className="border-b bg-muted/40">
                                    <tr>
                                      <th className="p-2 font-semibold">Student</th>
                                      <th className="p-2 font-semibold">Enrolled</th>
                                      <th className="p-2 font-semibold">Completed assignments</th>
                                      <th className="p-2 font-semibold">Average quiz</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {rosters[course.id].map((enrollment) => (
                                      <tr key={enrollment.student_id}>
                                        <td className="p-2">
                                          <p>{enrollment.email ?? "No email available"}</p>
                                          <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                                            {enrollment.student_id}
                                          </p>
                                        </td>
                                        <td className="p-2 text-muted-foreground">
                                          {new Date(enrollment.enrolled_at).toLocaleDateString()}
                                        </td>
                                        <td className="p-2">{enrollment.completed_tasks_count}</td>
                                        <td className="p-2">
                                          {enrollment.average_quiz_score === null
                                            ? "No attempts"
                                            : `${Math.round(enrollment.average_quiz_score)}%`}
                                        </td>
                                      </tr>
                                    ))}
                                    {rosters[course.id].length === 0 && (
                                      <tr><td className="p-3 text-center text-muted-foreground" colSpan={4}>No active enrollments.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            </TabsContent>

            {canManageCourses && (
              <TabsContent value="materials" className="mt-6">
                <Card className="p-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Course materials</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Documents are indexed and shared with students enrolled in the selected course.
                      </p>
                    </div>
                    <label className="grid gap-1 text-xs font-medium">
                      Course
                      <select
                        aria-label="Course for materials"
                        className="h-9 min-w-56 rounded-md border border-input bg-background px-2 text-sm"
                        onChange={(event) => setMaterialCourseId(event.target.value)}
                        value={materialCourseId}
                      >
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>{course.code} · {course.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <input
                    accept=".pdf,.docx,.pptx,.txt,.md"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void uploadCourseMaterial(file);
                    }}
                    ref={materialFileInput}
                    type="file"
                  />
                  <Button
                    className="mt-5 gap-2"
                    disabled={uploadingMaterial}
                    onClick={() => materialFileInput.current?.click()}
                    type="button"
                    variant="outline"
                  >
                    <Upload className="size-4" />
                    {uploadingMaterial ? "Uploading and indexing…" : "Upload course document"}
                  </Button>
                  {courses.length === 0 ? (
                    <p className="mt-2 text-xs text-amber-600">
                      Create a course first — shared materials need a course to belong to.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      PDF, DOCX, PPTX, TXT, or Markdown · up to 20 MB
                    </p>
                  )}

                  <ul className="mt-6 divide-y rounded-lg border">
                    {courseDocuments
                      .filter((document) => document.course_id === materialCourseId)
                      .map((document) => (
                        <li className="flex flex-wrap items-center justify-between gap-3 p-3" key={document.id}>
                          <div className="flex min-w-0 items-center gap-2">
                            <FileText className="size-4 shrink-0 text-primary" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {document.title ?? document.source_filename}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Indexed {new Date(document.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Button
                            aria-label={`Delete ${document.source_filename}`}
                            className="text-destructive"
                            onClick={() => void deleteCourseMaterial(document)}
                            size="xs"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="size-3.5" /> Delete
                          </Button>
                        </li>
                      ))}
                    {courseDocuments.filter((document) => document.course_id === materialCourseId).length === 0 && (
                      <li className="p-6 text-center text-sm text-muted-foreground">
                        No course documents have been uploaded yet.
                      </li>
                    )}
                  </ul>
                </Card>
              </TabsContent>
            )}

            {/* Catalog Search Tab */}
            {role === "student" && (
              <TabsContent value="catalog" className="mt-6">
                <Card className="p-6">
                  <h2 className="text-xl font-semibold">Find a course</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Search the university academic catalog and enroll instantly.
                  </p>
                  <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={searchCatalog}>
                    <label className="sr-only" htmlFor="catalog-search">
                      Search by course name or code
                    </label>
                    <Input
                      className="min-w-0 flex-1 text-sm"
                      id="catalog-search"
                      minLength={2}
                      onChange={(event) => setCatalogQuery(event.target.value)}
                      placeholder="Search course name or code"
                      required
                      value={catalogQuery}
                    />
                    <Button type="submit" className="gap-1.5 shrink-0">
                      <Search className="size-4" />
                      Search
                    </Button>
                  </form>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {catalog.map((course) => (
                      <Card key={course.id} className="p-4 flex items-center justify-between">
                        <div>
                          <Badge variant="outline" className="font-mono text-xs">
                            {course.code}
                          </Badge>
                          <h3 className="mt-1 font-medium text-sm text-foreground">{course.name}</h3>
                        </div>
                        <Button size="sm" onClick={() => void enroll(course)} type="button">
                          Enroll
                        </Button>
                      </Card>
                    ))}
                    {catalog.length === 0 && catalogQuery && (
                      <div className="col-span-full">
                        <EmptyState
                          icon={Search}
                          title="No courses matched"
                          description="Try another course keyword or code prefix."
                        />
                      </div>
                    )}
                  </div>
                </Card>
              </TabsContent>
            )}

            {/* Professor / Admin Management Tab */}
            {canManageCourses && (
              <TabsContent value="manage" className="mt-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <Card className="p-6">
                    <form className="space-y-4" onSubmit={createWorkspace}>
                      <div>
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                          <Layers className="size-4 text-primary" />
                          Create a workspace
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                          Group related courses and knowledge documents.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="workspace-name">
                          Workspace name
                        </label>
                        <Input
                          id="workspace-name"
                          maxLength={160}
                          minLength={1}
                          onChange={(event) => setWorkspaceName(event.target.value)}
                          required
                          value={workspaceName}
                          placeholder="e.g. Department of Computer Science"
                        />
                      </div>
                      <Button type="submit" className="w-full">
                        Create workspace
                      </Button>
                    </form>
                  </Card>

                  <Card className="p-6">
                    <form className="space-y-4" onSubmit={createCourse}>
                      <div>
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                          <PlusCircle className="size-4 text-primary" />
                          Add a course
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                          Create an official course code and title.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="course-workspace">
                          Workspace
                        </label>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          id="course-workspace"
                          onChange={(event) => setCourseWorkspace(event.target.value)}
                          required
                          value={courseWorkspace}
                        >
                          <option value="">Select workspace</option>
                          {workspaces.map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="course-code">
                          Course code
                        </label>
                        <Input
                          id="course-code"
                          maxLength={32}
                          onChange={(event) => setCourseCode(event.target.value)}
                          placeholder="e.g. CS-301"
                          required
                          value={courseCode}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="course-name">
                          Course name
                        </label>
                        <Input
                          id="course-name"
                          maxLength={160}
                          onChange={(event) => setCourseName(event.target.value)}
                          placeholder="e.g. Algorithms & Complexity"
                          required
                          value={courseName}
                        />
                      </div>
                      <Button type="submit" className="w-full">
                        Create course
                      </Button>
                    </form>
                  </Card>
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}
      </main>
    </div>
  );
}
