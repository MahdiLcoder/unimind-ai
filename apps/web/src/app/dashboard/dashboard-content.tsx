"use client";

import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { apiRequest } from "@/lib/api";

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
  upcoming_tasks: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    due_at: z.string(),
    status: z.string(),
    priority: z.string(),
    course_id: z.string().nullable(),
  })),
  recent_agent_runs: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    status: z.string(),
    created_at: z.string(),
  })),
  notifications: z.array(z.object({
    kind: z.enum(["deadline", "agent_failure"]),
    title: z.string(),
    message: z.string(),
    created_at: z.string(),
  })),
});
const notificationsSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    kind: z.string(),
    title: z.string(),
    message: z.string(),
    resource_type: z.string().nullable(),
    resource_id: z.string().nullable(),
    read_at: z.string().nullable(),
    created_at: z.string(),
  })),
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
          setError(cause instanceof Error ? cause.message : "Could not load your profile");
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
        { method: "POST", accessToken },
      );
      setNotifications((current) => current && ({
        ...current,
        items: current.items.map((item) => item.id === updated.id ? updated : item),
        unread_count: Math.max(0, current.unread_count - (updated.read_at ? 1 : 0)),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update notification");
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between border-b pb-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            UniMind AI
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <UserButton />
      </header>

      <section className="mt-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-sm text-muted-foreground">Your account</p>
        {(!authLoaded || !userLoaded) && (
          <p className="mt-3" role="status">Loading your profile…</p>
        )}
        {authLoaded && userLoaded && !profile && !error && (
          <p className="mt-3" role="status">Verifying your account with UniMind…</p>
        )}
        {profile && (
          <div className="mt-3">
            <h2 className="text-xl font-medium">
              {user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Welcome"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {roleLabels[profile.role]} account
            </p>
          </div>
        )}
        {error && (
          <div className="mt-4" role="alert">
            <p className="text-sm text-destructive">{error}</p>
            <button
              className="mt-3 inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
              onClick={() => {
                setError(null);
                setRetry((count) => count + 1);
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        )}
      </section>

      {summary && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Your university overview</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Courses", summary.course_count],
              ["Open tasks", summary.open_task_count],
              ["Completed tasks", summary.completed_task_count],
              ["Quiz attempts", summary.quiz_attempt_count],
              ["Average quiz score", summary.average_quiz_score_percent === null ? "—" : `${Math.round(summary.average_quiz_score_percent)}%`],
            ].map(([label, value]) => (
              <div className="rounded-xl border bg-card p-4" key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-2 text-2xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section>
              <h3 className="font-semibold">Upcoming deadlines</h3>
              <ul className="mt-3 space-y-2">
                {summary.upcoming_tasks.map((task) => (
                  <li className="rounded-lg border p-3" key={task.id}>
                    <p className="font-medium">{task.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Due {new Date(task.due_at).toLocaleString()} · {task.priority}
                    </p>
                  </li>
                ))}
                {summary.upcoming_tasks.length === 0 && <li className="rounded-lg border p-3 text-sm text-muted-foreground">No deadlines in the next seven days.</li>}
              </ul>
            </section>
            <section>
              <h3 className="font-semibold">Notifications{notifications?.unread_count ? ` · ${notifications.unread_count} unread` : ""}</h3>
              <ul className="mt-3 space-y-2">
                {(notifications?.items ?? []).map((item) => (
                  <li className="flex items-start justify-between gap-3 rounded-lg border p-3" key={item.id}>
                    <div>
                      <p className="font-medium">{item.title}{!item.read_at && <span className="ml-2 text-xs text-primary">New</span>}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    {!item.read_at && <button className="shrink-0 rounded-md border px-2 py-1 text-xs" onClick={() => void markNotificationRead(item.id)} type="button">Mark read</button>}
                  </li>
                ))}
                {(!notifications || notifications.items.length === 0) && summary.notifications.map((item, index) => (
                  <li className="rounded-lg border p-3" key={`${item.kind}-${item.created_at}-${index}`}>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                  </li>
                ))}
                {notifications?.items.length === 0 && summary.notifications.length === 0 && <li className="rounded-lg border p-3 text-sm text-muted-foreground">No current alerts.</li>}
              </ul>
            </section>
          </div>

          <section className="mt-6">
            <h3 className="font-semibold">Recent agent executions</h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {summary.recent_agent_runs.map((run) => (
                <li className="rounded-lg border p-3" key={run.id}>
                  <p className="font-medium">{run.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {run.status} · {new Date(run.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
              {summary.recent_agent_runs.length === 0 && <li className="rounded-lg border p-3 text-sm text-muted-foreground">No agent runs yet.</li>}
            </ul>
          </section>
        </section>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          className="rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/50"
          href="/workspace"
        >
          <h2 className="font-semibold">AI workspace</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Upload course material and ask the multi-agent assistant questions
            with citations.
          </p>
        </Link>
        <Link
          className="rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/50"
          href="/workspace#documents"
        >
          <h2 className="font-semibold">Knowledge hub</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Manage your private document library and search indexed sources.
          </p>
        </Link>
        <Link
          className="rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/50"
          href="/learning"
        >
          <h2 className="font-semibold">Learning studio</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Generate practice quizzes, track tasks, and create AI study plans.
          </p>
        </Link>
        <Link
          className="rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/50"
          href="/courses"
        >
          <h2 className="font-semibold">Courses</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Manage course workspaces, enrollments, and course knowledge access.
          </p>
        </Link>
        <Link
          className="rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/50"
          href="/research"
        >
          <h2 className="font-semibold">Research studio</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Search Crossref papers, build a saved library, and ask for literature reviews.
          </p>
        </Link>
        <Link
          className="rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/50"
          href="/coding"
        >
          <h2 className="font-semibold">Coding lab</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Get programming tutoring, code review, debugging, and challenge feedback.
          </p>
        </Link>
        {profile?.role === "administrator" && (
          <Link
            className="rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/50"
            href="/admin"
          >
            <h2 className="font-semibold">Administration</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Review accounts and manage platform roles.
            </p>
          </Link>
        )}
      </section>
    </main>
  );
}
