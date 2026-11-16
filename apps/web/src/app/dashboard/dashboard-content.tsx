"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
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

const userProfileSchema = z.object({
  clerk_user_id: z.string(),
  email: z.string().nullable(),
  role: z.enum(["student", "professor", "administrator"]),
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

type UserProfile = z.infer<typeof userProfileSchema>;
type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
type Notifications = z.infer<typeof notificationsSchema>;

const roleLabels: Record<UserProfile["role"], string> = {
  student: "Student",
  professor: "Professor",
  administrator: "Administrator",
};

export default function DashboardPage() {
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [notifications, setNotifications] = useState<Notifications | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!authLoaded || !userLoaded) return;

    let active = true;
    void getToken()
      .then((accessToken) => {
        if (!accessToken) throw new Error("No active session token was returned");
        return Promise.all([
          apiRequest("/api/v1/users/me", userProfileSchema, { accessToken }),
          apiRequest("/api/v1/dashboard/summary", dashboardSummarySchema, { accessToken }),
          apiRequest("/api/v1/notifications", notificationsSchema, { accessToken }),
        ]);
      })
      .then(([currentUser, currentSummary, currentNotifications]) => {
        if (active) {
          setProfile(currentUser);
          setSummary(currentSummary);
          setNotifications(currentNotifications);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          const err = cause instanceof Error ? cause.message : "Could not load your profile";
          setError(err);
          toast.error("Dashboard error: " + err);
        }
      });

    return () => {
      active = false;
    };
  }, [authLoaded, getToken, retry, userLoaded]);

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
      setNotifications((current) =>
        current && {
          ...current,
          items: current.items.map((item) => (item.id === updated.id ? updated : item)),
          unread_count: Math.max(0, current.unread_count - (updated.read_at ? 1 : 0)),
        }
      );
      toast.success("Notification marked as read");
    } catch (cause) {
      const err = cause instanceof Error ? cause.message : "Could not update notification";
      setError(err);
      toast.error(err);
    }
  }

  const isLoading = (!authLoaded || !userLoaded) || (!profile && !error);

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

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm" role="alert">
            <p className="font-medium text-destructive">{error}</p>
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
                Academic Progress & Activity
              </h2>
              <span className="text-xs text-muted-foreground">Current semester</span>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: "Courses", value: summary.course_count, icon: BookOpen },
                { label: "Open tasks", value: summary.open_task_count, icon: Clock },
                { label: "Completed tasks", value: summary.completed_task_count, icon: CheckCircle },
                { label: "Quiz attempts", value: summary.quiz_attempt_count, icon: Sparkles },
                {
                  label: "Average quiz score",
                  value: summary.average_quiz_score_percent === null ? "—" : `${Math.round(summary.average_quiz_score_percent)}%`,
                  icon: TrendingUp,
                },
              ].map(({ label, value, icon: Icon }) => (
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
                              window.location.href = "/workspace";
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
                              window.location.href = "/workspace";
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
      </main>
    </div>
  );
}
