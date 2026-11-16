"use client";

import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { motion, type Variants } from "framer-motion";
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
  GraduationCap,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
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

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.45, ease: "easeOut" },
  }),
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.05 } },
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
        {/* Header Breadcrumbs / Title */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                UniMind AI
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="text-xs font-medium text-muted-foreground">ISI Kef</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-xs font-medium text-muted-foreground">Overview</span>
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
              Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {profile && (
              <Badge variant="secondary" className="px-2.5 py-1 text-xs bg-primary/10 text-primary border-primary/20 font-medium">
                {roleLabels[profile.role]}
              </Badge>
            )}
            <UserButton />
          </div>
        </motion.header>

        {/* Profile Card Section */}
        <section aria-labelledby="profile-heading" className="mt-8">
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Active Account
                  </CardDescription>
                  {isLoading && (
                    <div className="mt-3 space-y-2" role="status">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-32" />
                      <span className="sr-only">Loading your profile…</span>
                    </div>
                  )}
                  {profile && (
                    <div className="mt-1">
                      <CardTitle id="profile-heading" className="text-xl font-semibold text-foreground">
                        {user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Welcome"}
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Signed in as {roleLabels[profile.role]} · {user?.primaryEmailAddress?.emailAddress ?? profile.email ?? ""}
                      </p>
                    </div>
                  )}
                </div>

                {profile && (
                  <div className="flex items-center gap-2">
                    <Link
                      href="/workspace"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Open AI Workspace
                    </Link>
                  </div>
                )}
              </div>
            </CardHeader>
            {error && (
              <CardContent className="pt-0">
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm" role="alert">
                  <p className="font-medium text-destructive">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={() => {
                      setError(null);
                      setRetry((count) => count + 1);
                      toast.info("Retrying profile reload…");
                    }}
                    type="button"
                  >
                    <RefreshCw className="size-3.5" />
                    Retry
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </section>

        {/* Quick Actions Launchpad */}
        <section aria-labelledby="quick-actions-heading" className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 id="quick-actions-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Academic Launchpad
            </h2>
            <span className="text-xs text-muted-foreground">Direct shortcuts</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                title: "AI Workspace",
                desc: "Chat with verified citations",
                href: "/workspace",
                icon: FolderKanban,
                color: "text-primary",
                bg: "bg-primary/10",
              },
              {
                title: "Study Plans",
                desc: "Adaptive schedules & quizzes",
                href: "/learning",
                icon: Sparkles,
                color: "text-amber-500",
                bg: "bg-amber-500/10",
              },
              {
                title: "Coding Lab",
                desc: "Sandboxed execution & tutor",
                href: "/coding",
                icon: Code2,
                color: "text-emerald-500",
                bg: "bg-emerald-500/10",
              },
              {
                title: "Research Studio",
                desc: "Crossref search & APA cite",
                href: "/research",
                icon: FileSearch,
                color: "text-rose-500",
                bg: "bg-rose-500/10",
              },
              {
                title: "Courses",
                desc: "Syllabi & assignments",
                href: "/courses",
                icon: BookOpen,
                color: "text-blue-500",
                bg: "bg-blue-500/10",
              },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.title}
                  href={action.href}
                  className="group relative flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between">
                    <div className={`flex size-9 items-center justify-center rounded-lg ${action.bg} ${action.color} transition-transform group-hover:scale-105`}>
                      <Icon className="size-4" />
                    </div>
                    <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{action.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{action.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* University Overview Metrics */}
        {summary && (
          <section aria-labelledby="overview-heading" className="mt-8">
            <div className="flex items-center justify-between">
              <h2 id="overview-heading" className="text-lg font-semibold tracking-tight text-foreground">
                Your university overview
              </h2>
              <span className="text-xs text-muted-foreground">Real-time sync</span>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                <Card key={label} className="p-4 shadow-xs">
                  <dt className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>{label}</span>
                    <Icon className="size-3.5 text-muted-foreground/70" />
                  </dt>
                  <dd className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</dd>
                </Card>
              ))}
            </dl>

            {/* Structured Tabbed Section for Detailed Items */}
            <Tabs defaultValue="all" className="mt-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                <TabsList className="h-9">
                  <TabsTrigger value="all">Combined View</TabsTrigger>
                  <TabsTrigger value="deadlines" className="gap-1.5">
                    Deadlines
                    {summary.upcoming_tasks.length > 0 && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {summary.upcoming_tasks.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="notifications" className="gap-1.5">
                    Alerts
                    {notifications && notifications.unread_count > 0 && (
                      <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                        {notifications.unread_count}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="agents">Agent Runs</TabsTrigger>
                </TabsList>
                <div className="text-xs text-muted-foreground">
                  Press <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">Tab</kbd> to cycle tabs
                </div>
              </div>

              {/* Combined View */}
              <TabsContent value="all" className="mt-6 space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Upcoming Deadlines */}
                  <Card className="shadow-xs">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base font-semibold">
                          <Calendar className="size-4 text-primary" />
                          Upcoming deadlines
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
                      <ul className="space-y-2.5">
                        {summary.upcoming_tasks.map((task) => (
                          <li
                            className="flex items-start justify-between gap-3 rounded-lg border bg-card/60 p-3 transition-colors hover:bg-muted/40"
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
                  <Card className="shadow-xs">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base font-semibold">
                          <Bell className="size-4 text-primary" />
                          Notifications
                          {notifications?.unread_count ? (
                            <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px]">
                              {notifications.unread_count} unread
                            </Badge>
                          ) : null}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2.5">
                        {(notifications?.items ?? []).map((item) => (
                          <li
                            className="flex items-start justify-between gap-3 rounded-lg border bg-card/60 p-3 transition-colors hover:bg-muted/40"
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
                              className="rounded-lg border p-3"
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
                <Card className="shadow-xs">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                      <Cpu className="size-4 text-primary" />
                      Recent agent executions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {summary.recent_agent_runs.map((run) => (
                        <li
                          className="flex items-start justify-between rounded-lg border bg-card/60 p-3 transition-colors hover:bg-muted/40"
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
                            actionHref="/workspace"
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
                    <CardTitle className="text-base font-semibold">Upcoming deadlines</CardTitle>
                    <CardDescription>Tasks scheduled across your enrolled courses</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5">
                      {summary.upcoming_tasks.map((task) => (
                        <li key={task.id} className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <p className="text-sm font-medium">{task.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Due: {new Date(task.due_at).toLocaleString()}
                            </p>
                          </div>
                          <Badge variant="outline">{task.priority}</Badge>
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
                    <CardTitle className="text-base font-semibold">System Alerts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5">
                      {(notifications?.items ?? []).map((item) => (
                        <li key={item.id} className="flex items-start justify-between rounded-lg border p-3">
                          <div>
                            <p className="text-sm font-medium">{item.title}</p>
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
                    <CardTitle className="text-base font-semibold">Recent Multi-Agent Workflows</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {summary.recent_agent_runs.map((run) => (
                        <li key={run.id} className="rounded-lg border p-3">
                          <p className="text-sm font-medium">{run.title}</p>
                          <p className="text-xs text-muted-foreground">{run.status}</p>
                        </li>
                      ))}
                      {summary.recent_agent_runs.length === 0 && (
                        <div className="col-span-full">
                          <EmptyState icon={Cpu} title="No agent runs" description="Start a workflow in Workspace or Coding Lab." />
                        </div>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>
        )}

        {/* Quick Hub Navigation Cards */}
        <section aria-labelledby="hub-heading" className="mt-10">
          <div className="border-t border-border/60 pt-8">
            <h2 id="hub-heading" className="text-lg font-semibold tracking-tight text-foreground">
              Academic workspaces & studios
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a specialized environment to start learning, researching, or coding.
            </p>

            <motion.div
              className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={stagger}
            >
              {[
                {
                  href: "/workspace",
                  title: "AI workspace",
                  description: "Upload course material and ask the multi-agent assistant questions with citations.",
                  icon: FolderKanban,
                },
                {
                  href: "/workspace#documents",
                  title: "Knowledge hub",
                  description: "Manage your private document library and search indexed sources.",
                  icon: BookOpen,
                },
                {
                  href: "/learning",
                  title: "Learning studio",
                  description: "Generate practice quizzes, track tasks, and create AI study plans.",
                  icon: Sparkles,
                },
                {
                  href: "/courses",
                  title: "Courses",
                  description: "Manage course workspaces, enrollments, and course knowledge access.",
                  icon: GraduationCap,
                },
                {
                  href: "/research",
                  title: "Research studio",
                  description: "Search Crossref papers, build a saved library, and ask for literature reviews.",
                  icon: FileSearch,
                },
                {
                  href: "/coding",
                  title: "Coding lab",
                  description: "Get programming tutoring, code review, debugging, and challenge feedback.",
                  icon: Code2,
                },
              ].map((hub, i) => {
                const Icon = hub.icon;
                return (
                  <motion.div key={hub.title} variants={fadeUp} custom={i}>
                    <Link
                      href={hub.href}
                      className="group flex h-full flex-col justify-between rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/20">
                            <Icon className="size-4" />
                          </div>
                          <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-1 group-hover:text-primary" />
                        </div>
                        <h3 className="mt-3.5 font-semibold text-foreground group-hover:text-primary transition-colors">
                          {hub.title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                          {hub.description}
                        </p>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}

              {profile?.role === "administrator" && (
                <motion.div variants={fadeUp} custom={6}>
                  <Link
                    href="/admin"
                    className="group flex h-full flex-col justify-between rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/20">
                          <Shield className="size-4" />
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-1 group-hover:text-primary" />
                      </div>
                      <h3 className="mt-3.5 font-semibold text-foreground group-hover:text-primary transition-colors">
                        Administration
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        Review accounts and manage platform roles.
                      </p>
                    </div>
                  </Link>
                </motion.div>
              )}
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  );
}
