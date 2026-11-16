"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { apiRequest } from "@/lib/api";

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
  const [assignmentTitles, setAssignmentTitles] = useState<Record<string, string>>({});
  const [assignmentDues, setAssignmentDues] = useState<Record<string, string>>({});
  const [rosters, setRosters] = useState<Record<string, string[]>>({});
  const [overviews, setOverviews] = useState<Record<string, Overview>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("No active session token was returned");
    const [profile, courseList, workspaceList] = await Promise.all([
      apiRequest("/api/v1/users/me", profileSchema, { accessToken: token }),
      apiRequest("/api/v1/courses", z.array(courseSchema), { accessToken: token }),
      apiRequest("/api/v1/workspaces", z.array(workspaceSchema), { accessToken: token }),
    ]);
    setRole(profile.role);
    setCourses(courseList);
    setWorkspaces(workspaceList);
    setCourseWorkspace((selected) => selected || workspaceList[0]?.id || "");
  }, [getToken]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(load)
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
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
        { accessToken: token },
      );
      setCatalog(result);
    } catch (cause) {
      setError(errorMessage(cause));
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
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
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
        },
      );
      setCourseCode("");
      setCourseName("");
      setNotice("Course created.");
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function enroll(course: Course) {
    setError(null);
    try {
      const token = await accessToken();
      await apiRequest(
        `/api/v1/courses/${course.id}/enrollment`,
        enrollmentSchema,
        { method: "POST", accessToken: token },
      );
      setNotice(`Enrolled in ${course.code}.`);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function showRoster(course: Course) {
    setError(null);
    try {
      const token = await accessToken();
      const roster = await apiRequest(
        `/api/v1/courses/${course.id}/enrollments`,
        z.array(enrollmentSchema),
        { accessToken: token },
      );
      setRosters((current) => ({
        ...current,
        [course.id]: roster.map((enrollment) => enrollment.student_id),
      }));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function showOverview(course: Course) {
    setError(null);
    try {
      const token = await accessToken();
      const overview = await apiRequest(
        `/api/v1/courses/${course.id}/learning-overview`,
        overviewSchema,
        { accessToken: token },
      );
      setOverviews((current) => ({ ...current, [course.id]: overview }));
    } catch (cause) {
      setError(errorMessage(cause));
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
      setNotice(`Assignment created for ${course.code}.`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const canManageCourses = role === "professor" || role === "administrator";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between border-b pb-6">
        <div>
          <Link className="text-sm text-muted-foreground hover:text-foreground" href="/dashboard">
            Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Courses</h1>
          <p className="mt-2 text-muted-foreground">
            Course access controls course materials, enrollment, and academic work.
          </p>
        </div>
        <UserButton />
      </header>

      {error && <p className="mt-6 rounded-lg border border-destructive/40 p-4 text-sm" role="alert">{error}</p>}
      {notice && <p className="mt-6 rounded-lg border p-4 text-sm" role="status">{notice}</p>}
      {loading && <p className="mt-6" role="status">Loading your courses…</p>}

      {canManageCourses && (
        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <form className="space-y-3 rounded-2xl border bg-card p-6" onSubmit={createWorkspace}>
            <h2 className="text-lg font-semibold">Create a workspace</h2>
            <label className="block text-sm" htmlFor="workspace-name">Workspace name</label>
            <input
              className="h-10 w-full rounded-md border bg-background px-3"
              id="workspace-name"
              maxLength={160}
              minLength={1}
              onChange={(event) => setWorkspaceName(event.target.value)}
              required
              value={workspaceName}
            />
            <button className="h-10 rounded-md bg-primary px-4 text-primary-foreground" type="submit">
              Create workspace
            </button>
          </form>

          <form className="space-y-3 rounded-2xl border bg-card p-6" onSubmit={createCourse}>
            <h2 className="text-lg font-semibold">Add a course</h2>
            <label className="block text-sm" htmlFor="course-workspace">Workspace</label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              id="course-workspace"
              onChange={(event) => setCourseWorkspace(event.target.value)}
              required
              value={courseWorkspace}
            >
              <option value="">Select workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
            <label className="block text-sm" htmlFor="course-code">Course code</label>
            <input
              className="h-10 w-full rounded-md border bg-background px-3"
              id="course-code"
              maxLength={32}
              onChange={(event) => setCourseCode(event.target.value)}
              required
              value={courseCode}
            />
            <label className="block text-sm" htmlFor="course-name">Course name</label>
            <input
              className="h-10 w-full rounded-md border bg-background px-3"
              id="course-name"
              maxLength={160}
              onChange={(event) => setCourseName(event.target.value)}
              required
              value={courseName}
            />
            <button className="h-10 rounded-md bg-primary px-4 text-primary-foreground" type="submit">
              Create course
            </button>
          </form>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{canManageCourses ? "Your courses" : "Enrolled courses"}</h2>
        {!loading && courses.length === 0 && (
          <p className="mt-3 rounded-xl border p-5 text-sm text-muted-foreground">
            No courses are linked to your account yet.
          </p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {courses.map((course) => (
            <article className="rounded-2xl border bg-card p-5" key={course.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{course.code}</p>
              <h3 className="mt-2 font-semibold">{course.name}</h3>
              {course.description && <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>}
              <Link className="mt-4 inline-block text-sm underline" href={`/workspace?course=${encodeURIComponent(course.id)}`}>
                Open course workspace
              </Link>
              {canManageCourses && (
                <div className="mt-4">
                  <form className="mb-4 grid gap-2 rounded-lg border p-3" onSubmit={(event) => void createAssignment(event, course)}>
                    <h4 className="text-sm font-semibold">Create a course assignment</h4>
                    <label className="sr-only" htmlFor={`assignment-title-${course.id}`}>Assignment title for {course.code}</label>
                    <input
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      id={`assignment-title-${course.id}`}
                      maxLength={200}
                      onChange={(event) => setAssignmentTitles((current) => ({ ...current, [course.id]: event.target.value }))}
                      placeholder="Assignment title"
                      required
                      value={assignmentTitles[course.id] ?? ""}
                    />
                    <label className="text-xs text-muted-foreground" htmlFor={`assignment-due-${course.id}`}>Due date (optional)</label>
                    <input
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      id={`assignment-due-${course.id}`}
                      onChange={(event) => setAssignmentDues((current) => ({ ...current, [course.id]: event.target.value }))}
                      type="datetime-local"
                      value={assignmentDues[course.id] ?? ""}
                    />
                    <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted" type="submit">Assign to enrolled students</button>
                  </form>
                  <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={() => void showRoster(course)} type="button">
                    View enrolled students
                  </button>
                  <button className="ml-2 rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={() => void showOverview(course)} type="button">
                    Learning overview
                  </button>
                  {overviews[course.id] && (
                    <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3">
                      <div><dt className="text-muted-foreground">Active students</dt><dd className="font-medium">{overviews[course.id].active_students}</dd></div>
                      <div><dt className="text-muted-foreground">Assignments</dt><dd className="font-medium">{overviews[course.id].assignments}</dd></div>
                      <div><dt className="text-muted-foreground">Completions</dt><dd className="font-medium">{overviews[course.id].assignment_completions}</dd></div>
                      <div><dt className="text-muted-foreground">Quiz attempts</dt><dd className="font-medium">{overviews[course.id].quiz_attempts}</dd></div>
                      <div><dt className="text-muted-foreground">Average quiz score</dt><dd className="font-medium">{overviews[course.id].average_quiz_score_percent == null ? "—" : `${Math.round(overviews[course.id].average_quiz_score_percent ?? 0)}%`}</dd></div>
                    </dl>
                  )}
                  {rosters[course.id] && (
                    <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                      {rosters[course.id].map((studentId) => <li key={studentId}>{studentId}</li>)}
                      {rosters[course.id].length === 0 && <li>No active enrollments.</li>}
                    </ul>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {role === "student" && (
        <section className="mt-10 border-t pt-8">
          <h2 className="text-xl font-semibold">Find a course</h2>
          <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={searchCatalog}>
            <label className="sr-only" htmlFor="catalog-search">Search by course name or code</label>
            <input
              className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3"
              id="catalog-search"
              minLength={2}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder="Search course name or code"
              required
              value={catalogQuery}
            />
            <button className="h-10 rounded-md border px-4 hover:bg-muted" type="submit">Search</button>
          </form>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {catalog.map((course) => (
              <article className="flex items-center justify-between gap-4 rounded-xl border p-4" key={course.id}>
                <div>
                  <p className="text-xs font-semibold text-primary">{course.code}</p>
                  <h3 className="mt-1 font-medium">{course.name}</h3>
                </div>
                <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => void enroll(course)} type="button">
                  Enroll
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
