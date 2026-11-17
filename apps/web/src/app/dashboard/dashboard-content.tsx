"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  FolderKanban,
  BookOpen,
  Sparkles,
  Code2,
  FileSearch,
  Shield,
  Clock,
  Bell,
  Cpu,
  RefreshCw,
  Calendar,
  CheckCircle,
  ArrowRight,
  TrendingUp,
  Users,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const userProfileSchema = z.object({
  clerk_user_id: z.string(),
  email: z.string().nullable(),
  role: z.enum(["student", "professor", "administrator"]),
  display_name: z.string().nullable(),
  university: z.string().nullable(),
  department: z.string().nullable(),
  program: z.string().nullable(),
  created_at: z.string(),
});
const dashboardSummarySchema = z.object({
  role: z.enum(["student", "professor", "administrator"]),
  course_count: z.number(),
  open_task_count: z.number(),
  completed_task_count: z.number(),
  quiz_attempt_count: z.number(),
  average_quiz_score_percent: z.number().nullable(),
  upcoming_tasks: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      due_at: z.string(),
      status: z.string(),
      priority: z.string(),
      course_id: z.string().nullable(),
    })
  ),
  recent_agent_runs: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      status: z.string(),
      created_at: z.string(),
    })
  ),
  notifications: z.array(
    z.object({
      kind: z.enum(["deadline", "agent_failure"]),
      title: z.string(),
      message: z.string(),
      created_at: z.string(),
    })
  ),
});
const notificationsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      kind: z.string(),
      title: z.string(),
      message: z.string(),
      resource_type: z.string().nullable(),
      resource_id: z.string().nullable(),
      read_at: z.string().nullable(),
      created_at: z.string(),
    })
  ),
  unread_count: z.number(),
});
const teachingCourseSchema = z.object({ id: z.string() });
const courseLearningOverviewSchema = z.object({
  course_id: z.string(),
  active_students: z.number(),
  assignments: z.number(),
  assignment_completions: z.number(),
  quiz_attempts: z.number(),
  average_quiz_score_percent: z.number().nullable(),
  pending_submissions_count: z.number(),
});

type UserProfile = z.infer<typeof userProfileSchema>;
type ProfileDraft = {
  display_name: string;
  university: string;
  department: string;
  program: string;
};
type ProfileDraftState = { userId: string; values: ProfileDraft };
type TeachingMetrics = {
  enrolledStudents: number;
  pendingAssignments: number;
  averageQuizScore: number | null;
};

const roleLabels: Record<UserProfile["role"], string> = {
  student: "Student",
  professor: "Professor",
  administrator: "Administrator",
};

export default function DashboardPage() {
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [profileDraft, setProfileDraft] = useState<ProfileDraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", user?.id, retry],
    enabled: authLoaded && userLoaded && !!user?.id,
    queryFn: async () => {
      const accessToken = await getToken();
      if (!accessToken) throw new Error("No active session token was returned");
      const [currentUser, currentSummary, currentNotifications] = await Promise.all([
        apiRequest("/api/v1/users/me", userProfileSchema, { accessToken }),
        apiRequest("/api/v1/dashboard/summary", dashboardSummarySchema, { accessToken }),
        apiRequest("/api/v1/notifications", notificationsSchema, { accessToken }),
      ]);
      let currentTeachingMetrics: TeachingMetrics | null = null;
      if (currentUser.role === "professor") {
        const courseList = await apiRequest(
          "/api/v1/courses",
          z.array(teachingCourseSchema),
          { accessToken }
        );
        const overviews = await Promise.all(
          courseList.map((course) =>
            apiRequest(
              `/api/v1/courses/${course.id}/learning-overview`,
              courseLearningOverviewSchema,
              { accessToken }
            )
          )
        );
        const quizAttempts = overviews.reduce((total, item) => total + item.quiz_attempts, 0);
        const weightedQuizScore = overviews.reduce(
          (total, item) => total + (item.average_quiz_score_percent ?? 0) * item.quiz_attempts,
          0
        );
        currentTeachingMetrics = {
          enrolledStudents: overviews.reduce((total, item) => total + item.active_students, 0),
          pendingAssignments: overviews.reduce(
            (total, item) => total + item.pending_submissions_count,
            0
          ),
          averageQuizScore: quizAttempts > 0 ? weightedQuizScore / quizAttempts : null,
        };
      }
      return {
        profile: currentUser,
        summary: currentSummary,
        notifications: currentNotifications,
        teachingMetrics: currentTeachingMetrics,
      };
    },
  });

  const profile = dashboardQuery.data?.profile ?? null;
  const summary = dashboardQuery.data?.summary ?? null;
  const notifications = dashboardQuery.data?.notifications ?? null;
  const teachingMetrics = dashboardQuery.data?.teachingMetrics ?? null;
  const resolvedError =
    error ??
    (dashboardQuery.error instanceof Error
      ? dashboardQuery.error.message
      : dashboardQuery.error
        ? "Could not load your profile"
        : null);
  const profileDefaults: ProfileDraft = {
    display_name: profile?.display_name ?? "",
    university: profile?.university ?? "",
    department: profile?.department ?? "",
    program: profile?.program ?? "",
  };
  const resolvedProfileDraft =
    profileDraft && profileDraft.userId === user?.id
      ? profileDraft.values
      : profileDefaults;

  useEffect(() => {
    if (dashboardQuery.error) {
      const err =
        dashboardQuery.error instanceof Error
          ? dashboardQuery.error.message
          : "Could not load your profile";
      toast.error(`Dashboard error: ${err}`);
    }
  }, [dashboardQuery.error]);

  async function markNotificationRead(notificationId: string) {
    setError(null);
    try {
      const accessToken = await getToken();
      if (!accessToken) throw new Error("No active session token was returned");
      const updated = await apiRequest(
        `/api/v1/notifications/${notificationId}/read`,
        notificationsSchema.shape.items.element,
        { method: "POST", accessToken }
      );
      queryClient.setQueryData(
        ["dashboard", user?.id, retry],
        (current: typeof dashboardQuery.data) =>
          current
            ? {
                ...current,
                notifications: {
                  ...current.notifications,
                  items: current.notifications.items.map((item) =>
                    item.id === updated.id ? updated : item
                  ),
                  unread_count: Math.max(
                    0,
                    current.notifications.unread_count - (updated.read_at ? 1 : 0)
                  ),
                },
              }
            : current
      );
      toast.success("Notification marked as read");
    } catch (cause) {
      const err = cause instanceof Error ? cause.message : "Could not update notification";
      setError(err);
      toast.error(err);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const accessToken = await getToken();
      if (!accessToken) throw new Error("No active session token was returned");
      const updatedProfile = await apiRequest(
        "/api/v1/users/me",
        userProfileSchema,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resolvedProfileDraft),
          accessToken,
        }
      );
      setProfileDraft({
        userId: user?.id ?? "",
        values: {
          display_name: updatedProfile.display_name ?? "",
          university: updatedProfile.university ?? "",
          department: updatedProfile.department ?? "",
          program: updatedProfile.program ?? "",
        },
      });
      queryClient.setQueryData(
        ["dashboard", user?.id, retry],
        (current: typeof dashboardQuery.data) =>
          current ? { ...current, profile: updatedProfile } : current
      );
      toast.success("Profile saved");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save your profile";
      setError(message);
      toast.error(message);
    }
  }

  const isLoading = !authLoaded || !userLoaded || dashboardQuery.isLoading;

  const workspaces = [
    {
      title: "AI Workspace",
      desc: "Chat with course documents & verified citations",
      href: "/workspace",
      icon: FolderKanban,
    },
    {
      title: "Courses",
      desc: "Syllabi, course documents & assignments",
      href: "/courses",
      icon: BookOpen,
    },
    {
      title: "Learning Studio",
      desc: "Adaptive study plans, quizzes & tasks",
      href: "/learning",
      icon: Sparkles,
    },
    {
      title: "Research Studio",
      desc: "Crossref search & APA bibliography",
      href: "/research",
      icon: FileSearch,
    },
    {
      title: "Coding Lab",
      desc: "Sandboxed Python execution & code tutor",
      href: "/coding",
      icon: Code2,
    },
    ...(profile?.role === "administrator"
      ? [
          {
            title: "Administration",
            desc: "User roles, access control & audit",
            href: "/admin",
            icon: Shield,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
        <PageHeader
          title={user?.firstName ? `Welcome, ${user.firstName}` : "Academic Dashboard"}
          description={
            profile
              ? `Signed in as ${roleLabels[profile.role]} · ISI Kef Academic Portal`
              : "Loading your academic context…"
          }
          badge={
            profile ? (
              <Badge variant="secondary" className="font-medium text-xs">
                {roleLabels[profile.role]}
              </Badge>
            ) : null
          }
        >
          <Link
            href="/workspace"
            className={buttonVariants({ size: "sm" })}
          >
            <span>Open AI Workspace</span>
            <ArrowRight className="size-3.5 ml-1.5" />
          </Link>
        </PageHeader>

        {resolvedError && (
          <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm" role="alert">
            <p className="font-medium text-destructive">{resolvedError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => {
                setError(null);
                setRetry((count) => count + 1);
                toast.info("Retrying dashboard reload…");
              }}
              type="button"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        )}

        {/* Workspaces Navigation */}
        <section aria-labelledby="workspaces-heading" className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 id="workspaces-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Academic Workspaces
            </h2>
            <span className="text-xs text-muted-foreground">Core modules</span>
          </div>
          <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-${workspaces.length > 5 ? "3" : "5"}`}>
            {workspaces.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.title}
                  href={action.href}
                  className="group relative flex flex-col justify-between rounded-lg border border-border/70 bg-card p-4 transition-all duration-150 hover:border-border hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex size-8 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-foreground">
                      <Icon className="size-4" />
                    </div>
                    <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {action.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                      {action.desc}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* University Overview Metrics */}
        {isLoading && !summary && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-7 w-12" />
              </Card>
            ))}
          </div>
        )}

        {summary && (
          <section aria-labelledby="overview-heading" className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 id="overview-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {profile?.role === "professor" ? "Teaching Overview" : "Academic Progress & Activity"}
              </h2>
              <span className="text-xs text-muted-foreground">Current semester</span>
            </div>

            <dl className={`grid gap-3 sm:grid-cols-2 ${profile?.role === "professor" ? "lg:grid-cols-3" : "lg:grid-cols-5"}`}>
              {(profile?.role === "professor"
                ? [
                    { label: "Total enrolled students", value: teachingMetrics?.enrolledStudents ?? "—", icon: Users },
                    { label: "Pending assignments", value: teachingMetrics?.pendingAssignments ?? "—", icon: Clock },
                    {
                      label: "Average course quiz score",
                      value: teachingMetrics?.averageQuizScore == null ? "—" : `${Math.round(teachingMetrics.averageQuizScore)}%`,
                      icon: TrendingUp,
                    },
                  ]
                : [
                { label: "Courses", value: summary.course_count, icon: BookOpen },
                { label: "Open tasks", value: summary.open_task_count, icon: Clock },
                { label: "Completed tasks", value: summary.completed_task_count, icon: CheckCircle },
                { label: "Quiz attempts", value: summary.quiz_attempt_count, icon: Sparkles },
                {
                  label: "Average quiz score",
                  value: summary.average_quiz_score_percent === null ? "—" : `${Math.round(summary.average_quiz_score_percent)}%`,
                  icon: TrendingUp,
                },
              ]).map(({ label, value, icon: Icon }) => (
                <Card key={label} className="p-4">
                  <dt className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>{label}</span>
                    <Icon className="size-3.5 text-muted-foreground/60" />
                  </dt>
                  <dd className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</dd>
                </Card>
              ))}
            </dl>

            {/* Structured Tabbed Section */}
            <Tabs defaultValue="all" className="mt-8">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="deadlines" className="gap-1.5 text-xs">
                    Deadlines
                    {summary.upcoming_tasks.length > 0 && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {summary.upcoming_tasks.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="notifications" className="gap-1.5 text-xs">
                    Alerts
                    {notifications && notifications.unread_count > 0 && (
                      <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                        {notifications.unread_count}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="agents" className="text-xs">Agent Runs</TabsTrigger>
                </TabsList>
              </div>

              {/* Combined View */}
              <TabsContent value="all" className="mt-6 space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Upcoming Deadlines */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                          <Calendar className="size-4 text-muted-foreground" />
                          Upcoming Deadlines
                        </CardTitle>
                        <Link
                          href="/learning"
                          className={buttonVariants({ variant: "ghost", size: "xs" })}
                        >
                          View all tasks
                        </Link>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {summary.upcoming_tasks.map((task) => (
                          <li
                            className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                            key={task.id}
                          >
                            <div className="space-y-1">
                              <p className="text-sm font-medium leading-none text-foreground">{task.title}</p>
                              <p className="text-xs text-muted-foreground">
                                Due {new Date(task.due_at).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <Badge
                              variant={
                                task.priority === "high"
                                  ? "destructive"
                                  : task.priority === "medium"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-[10px] capitalize"
                            >
                              {task.priority}
                            </Badge>
                          </li>
                        ))}
                        {summary.upcoming_tasks.length === 0 && (
                          <EmptyState
                            icon={CheckCircle}
                            title="No deadlines pending"
                            description="You have no tasks due in the next seven days. Everything is up to date!"
                          />
                        )}
                      </ul>
                    </CardContent>
                  </Card>

                  {/* Notifications */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                          <Bell className="size-4 text-muted-foreground" />
                          System Alerts
                          {notifications?.unread_count ? (
                            <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px]">
                              {notifications.unread_count} unread
                            </Badge>
                          ) : null}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {(notifications?.items ?? []).map((item) => (
                          <li
                            className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                            key={item.id}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{item.title}</p>
                                {!item.read_at && (
                                  <Badge variant="default" className="h-4 px-1 text-[9px] font-semibold">
                                    New
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{item.message}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(item.created_at).toLocaleString()}
                              </p>
                            </div>
                            {!item.read_at && (
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => void markNotificationRead(item.id)}
                                type="button"
                                className="shrink-0"
                              >
                                Mark read
                              </Button>
                            )}
                          </li>
                        ))}
                        {(!notifications || notifications.items.length === 0) &&
                          summary.notifications.map((item, index) => (
                            <li
                              className="rounded-lg border border-border/60 p-3"
                              key={`${item.kind}-${item.created_at}-${index}`}
                            >
                              <p className="text-sm font-medium text-foreground">{item.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
                            </li>
                          ))}
                        {notifications?.items.length === 0 && summary.notifications.length === 0 && (
                          <EmptyState
                            icon={Bell}
                            title="All caught up"
                            description="No current alerts or notifications for your account."
                          />
                        )}
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Agent Executions */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <Cpu className="size-4 text-muted-foreground" />
                      Recent Multi-Agent Executions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {summary.recent_agent_runs.map((run) => (
                        <li
                          className="flex items-start justify-between rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                          key={run.id}
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{run.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(run.created_at).toLocaleString()}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {run.status}
                          </Badge>
                        </li>
                      ))}
                      {summary.recent_agent_runs.length === 0 && (
                        <div className="col-span-full">
                          <EmptyState
                            icon={Cpu}
                            title="No agent runs yet"
                            description="Agent runs initiated in the Workspace or Coding lab will appear here."
                            actionLabel="Open Workspace"
                            onAction={() => {
                              router.push("/workspace");
                            }}
                          />
                        </div>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Deadlines Only Tab */}
              <TabsContent value="deadlines" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Upcoming deadlines</CardTitle>
                    <CardDescription className="text-xs">Tasks scheduled across your enrolled courses</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {summary.upcoming_tasks.map((task) => (
                        <li key={task.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{task.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Due: {new Date(task.due_at).toLocaleString()}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">{task.priority}</Badge>
                        </li>
                      ))}
                      {summary.upcoming_tasks.length === 0 && (
                        <EmptyState
                          icon={CheckCircle}
                          title="No upcoming deadlines"
                          description="You have no tasks due in the next seven days."
                        />
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Notifications Only Tab */}
              <TabsContent value="notifications" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">System Alerts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(notifications?.items ?? []).map((item) => (
                        <li key={item.id} className="flex items-start justify-between rounded-lg border border-border/60 p-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.message}</p>
                          </div>
                          {!item.read_at && (
                            <Button size="xs" variant="outline" onClick={() => void markNotificationRead(item.id)}>
                              Mark read
                            </Button>
                          )}
                        </li>
                      ))}
                      {notifications?.items.length === 0 && (
                        <EmptyState icon={Bell} title="No notifications" description="All caught up!" />
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Agent Runs Only Tab */}
              <TabsContent value="agents" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Recent Multi-Agent Workflows</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {summary.recent_agent_runs.map((run) => (
                        <li key={run.id} className="rounded-lg border border-border/60 p-3">
                          <p className="text-sm font-medium text-foreground">{run.title}</p>
                          <p className="text-xs text-muted-foreground">{run.status}</p>
                        </li>
                      ))}
                      {summary.recent_agent_runs.length === 0 && (
                        <div className="col-span-full">
                          <EmptyState
                            icon={Cpu}
                            title="No agent runs"
                            description="Start a workflow in Workspace or Coding Lab."
                            actionLabel="Open Workspace"
                            onAction={() => {
                              router.push("/workspace");
                            }}
                          />
                        </div>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>
        )}
        {profile && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Academic profile</CardTitle>
              <CardDescription className="text-xs">
                These app-owned details personalize the university experience. Clerk continues to manage your sign-in and email.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveProfile}>
                {(
                  [
                    ["display_name", "Display name", 160],
                    ["university", "University", 200],
                    ["department", "Department", 160],
                    ["program", "Program", 160],
                  ] as const
                ).map(([field, label, maxLength]) => (
                  <div key={field}>
                    <label className="mb-1.5 block text-xs font-medium" htmlFor={`profile-${field}`}>
                      {label}
                    </label>
                    <Input
                      id={`profile-${field}`}
                      maxLength={maxLength}
                      onChange={(event) =>
                        setProfileDraft((current) => ({
                          userId: user?.id ?? "",
                          values: {
                            ...(current && current.userId === user?.id
                              ? current.values
                              : profileDefaults),
                            [field]: event.target.value,
                          },
                        }))
                      }
                      value={resolvedProfileDraft[field]}
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <Button type="submit">Save profile</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
