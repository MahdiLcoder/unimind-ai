"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        z.array(enrollmentSchema),
        { accessToken: token }
      );
      setRosters((current) => ({
        ...current,
        [course.id]: roster.map((enrollment) => enrollment.student_id),
      }));
      toast.info(`Loaded roster for ${course.code}`);
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link className="text-xs font-semibold uppercase tracking-[0.16em] text-primary" href="/dashboard">
              Dashboard
            </Link>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Courses</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Course access controls course materials, enrollment, and academic work.
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
            <p className="sr-only">Loading your courses…</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          </div>
        ) : (
          <Tabs defaultValue="courses" className="mt-8">
            <TabsList className="h-9">
              <TabsTrigger value="courses">
                {canManageCourses ? "Your courses" : "Enrolled courses"}
              </TabsTrigger>
              {role === "student" && <TabsTrigger value="catalog">Browse Catalog</TabsTrigger>}
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

                <div className="grid gap-5 sm:grid-cols-2">
                  {courses.map((course) => (
                    <Card key={course.id} className="flex flex-col justify-between shadow-xs">
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
                              </dl>
                            )}

                            {rosters[course.id] && (
                              <ul className="space-y-1 text-xs text-muted-foreground rounded-lg border p-3">
                                <li className="font-semibold text-foreground mb-1">Roster:</li>
                                {rosters[course.id].map((studentId) => (
                                  <li key={studentId} className="font-mono text-[11px]">{studentId}</li>
                                ))}
                                {rosters[course.id].length === 0 && <li>No active enrollments.</li>}
                              </ul>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            </TabsContent>

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
