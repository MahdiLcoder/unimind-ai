"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Users,
  ToggleLeft,
  Layers,
  History,
  Trash2,
  Lock,
} from "lucide-react";
import { apiFetch, apiRequest } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const userSchema = z.object({
  clerk_user_id: z.string(),
  email: z.string().nullable(),
  role: z.enum(["student", "professor", "administrator"]),
  created_at: z.string(),
});
const featuresSchema = z.object({
  features: z.array(z.object({ key: z.string(), enabled: z.boolean() })),
});
const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  course_count: z.number(),
});
const auditSchema = z.object({
  id: z.string().uuid(),
  actor_id: z.string(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});
type UserProfile = z.infer<typeof userSchema>;
type UserRole = UserProfile["role"];
type PlatformFeature = z.infer<typeof featuresSchema>["features"][number];
type Workspace = z.infer<typeof workspaceSchema>;
type AuditEntry = z.infer<typeof auditSchema>;

const roles: UserRole[] = ["student", "professor", "administrator"];
const roleLabel: Record<UserRole, string> = {
  student: "Student",
  professor: "Professor",
  administrator: "Administrator",
};

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The request could not be completed";
}

export default function AdminContent() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [features, setFeatures] = useState<PlatformFeature[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [self, setSelf] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const accessToken = await getToken();
    if (!accessToken) throw new Error("No active session token was returned");
    const profile = await apiRequest("/api/v1/users/me", userSchema, { accessToken });
    setSelf(profile.clerk_user_id);
    setAuthorized(profile.role === "administrator");
    if (profile.role !== "administrator") return;
    const [userList, featureList, workspaceList, logs] = await Promise.all([
      apiRequest("/api/v1/users?limit=100", z.array(userSchema), { accessToken }),
      apiRequest("/api/v1/admin/features", featuresSchema, { accessToken }),
      apiRequest("/api/v1/admin/workspaces?limit=100", z.array(workspaceSchema), { accessToken }),
      apiRequest("/api/v1/admin/audit-logs?limit=100", z.array(auditSchema), { accessToken }),
    ]);
    setUsers(userList);
    setFeatures(featureList.features);
    setWorkspaces(workspaceList);
    setAuditLogs(logs);
  }, [getToken]);

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

  async function changeRole(user: UserProfile, role: UserRole) {
    setError(null);
    setNotice(null);
    try {
      const accessToken = await getToken();
      if (!accessToken) throw new Error("No active session token was returned");
      const updated = await apiRequest(
        `/api/v1/users/${encodeURIComponent(user.clerk_user_id)}/role`,
        userSchema,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
          accessToken,
        }
      );
      setUsers((current) =>
        current.map((item) => (item.clerk_user_id === updated.clerk_user_id ? updated : item))
      );
      const msg = `Updated ${updated.email ?? updated.clerk_user_id} to ${roleLabel[role]}.`;
      setNotice(msg);
      toast.success(msg);
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
      await load().catch((loadCause: unknown) => setError(message(loadCause)));
    }
  }

  async function setFeature(feature: PlatformFeature, enabled: boolean) {
    setError(null);
    setNotice(null);
    try {
      const accessToken = await getToken();
      if (!accessToken) throw new Error("No active session token was returned");
      const updated = await apiRequest(
        `/api/v1/admin/features/${encodeURIComponent(feature.key)}`,
        z.object({ key: z.string(), enabled: z.boolean() }),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
          accessToken,
        }
      );
      setFeatures((current) =>
        current.map((item) => (item.key === updated.key ? updated : item))
      );
      const msg = `Feature ${updated.key} ${enabled ? "enabled" : "disabled"}.`;
      setNotice(msg);
      toast.success(msg);
      const logs = await apiRequest("/api/v1/admin/audit-logs?limit=100", z.array(auditSchema), {
        accessToken,
      });
      setAuditLogs(logs);
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    }
  }

  async function deleteWorkspace(workspace: Workspace) {
    if (!window.confirm(`Delete "${workspace.name}" and its courses and course data? This cannot be undone.`)) {
      return;
    }
    setError(null);
    try {
      const accessToken = await getToken();
      if (!accessToken) throw new Error("No active session token was returned");
      const response = await apiFetch(`/api/v1/admin/workspaces/${workspace.id}`, {
        method: "DELETE",
        accessToken,
      });
      if (!response.ok) throw new Error(`Could not delete workspace (${response.status})`);
      setWorkspaces((current) => current.filter((item) => item.id !== workspace.id));
      const msg = `Workspace "${workspace.name}" deleted.`;
      setNotice(msg);
      toast.success(msg);
      await load();
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
        <PageHeader
          title="Administration"
          description="Governance, role-based access control, and audit logs for ISI Kef academic platform"
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

        {loading && (
          <div className="mt-8 space-y-4" role="status">
            <p className="sr-only">Loading users…</p>
            <Card className="p-6 space-y-3">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </Card>
          </div>
        )}

        {!loading && authorized === false && (
          <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
            <Lock className="size-8 text-destructive mx-auto" />
            <h2 className="mt-3 text-lg font-semibold text-destructive">Administrator access is required.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your account lacks administrator privileges for this route. Contact your institution supervisor.
            </p>
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4" })}
            >
              Return to Dashboard
            </Link>
          </div>
        )}

        {authorized && (
          <div className="mt-8 space-y-10">
            {/* Quick jump navigation */}
            <nav aria-label="Admin Sections" className="flex flex-wrap gap-2 border-b pb-4">
              <a
                href="#users-section"
                className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Users className="size-3.5 text-primary" />
                <span>Users ({users.length})</span>
              </a>
              <a
                href="#features-section"
                className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <ToggleLeft className="size-3.5 text-primary" />
                <span>Features ({features.length})</span>
              </a>
              <a
                href="#workspaces-section"
                className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Layers className="size-3.5 text-primary" />
                <span>Workspaces ({workspaces.length})</span>
              </a>
              <a
                href="#audit-section"
                className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <History className="size-3.5 text-primary" />
                <span>Audit Logs ({auditLogs.length})</span>
              </a>
            </nav>

            {/* Users Section */}
            <section id="users-section" aria-labelledby="users-heading">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <CardTitle id="users-heading" className="text-xl font-semibold">
                      Users
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Role changes take effect on the next authenticated API request.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{users.length} registered</Badge>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 font-semibold text-foreground text-xs uppercase tracking-wider">Account</th>
                        <th className="p-3 font-semibold text-foreground text-xs uppercase tracking-wider">Role</th>
                        <th className="p-3 font-semibold text-foreground text-xs uppercase tracking-wider">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {users.map((user) => (
                        <tr className="hover:bg-muted/30 transition-colors" key={user.clerk_user_id}>
                          <td className="p-3">
                            <p className="font-medium text-foreground">{user.email ?? "No email available"}</p>
                            <p className="mt-0.5 break-all text-[11px] font-mono text-muted-foreground">
                              {user.clerk_user_id}
                            </p>
                          </td>
                          <td className="p-3">
                            <label className="sr-only" htmlFor={`role-${user.clerk_user_id}`}>
                              Role for {user.email ?? user.clerk_user_id}
                            </label>
                            <select
                              aria-label={`Role for ${user.email ?? user.clerk_user_id}`}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                              disabled={user.clerk_user_id === self}
                              id={`role-${user.clerk_user_id}`}
                              onChange={(event) =>
                                void changeRole(user, userSchema.shape.role.parse(event.target.value))
                              }
                              value={user.role}
                            >
                              {roles.map((role) => (
                                <option key={role} value={role}>
                                  {roleLabel[role]}
                                </option>
                              ))}
                            </select>
                            {user.clerk_user_id === self && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                Current administrator
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                      {!loading && users.length === 0 && (
                        <tr>
                          <td className="p-4 text-muted-foreground text-center" colSpan={3}>
                            No user records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>

            {/* Platform Features Section */}
            <section id="features-section" aria-labelledby="features-heading" className="border-t pt-8">
              <Card className="p-6">
                <CardTitle id="features-heading" className="text-xl font-semibold">
                  Platform features
                </CardTitle>
                <CardDescription className="text-xs mb-4">
                  These switches are enforced by the API.
                </CardDescription>

                <ul className="grid gap-3 sm:grid-cols-2">
                  {features.map((feature) => (
                    <li
                      className="flex items-center justify-between gap-4 rounded-xl border bg-card/60 p-4 transition-colors hover:bg-muted/40"
                      key={feature.key}
                    >
                      <div className="space-y-0.5">
                        <span className="font-medium text-sm text-foreground">
                          {feature.key.replaceAll("_", " ")}
                        </span>
                        <p className="text-[11px] font-mono text-muted-foreground">{feature.key}</p>
                      </div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer font-medium">
                        <input
                          checked={feature.enabled}
                          onChange={(event) => void setFeature(feature, event.target.checked)}
                          type="checkbox"
                          className="accent-primary size-4"
                        />
                        <Badge variant={feature.enabled ? "default" : "secondary"} className="text-[10px]">
                          {feature.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </label>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>

            {/* Workspaces Section */}
            <section id="workspaces-section" aria-labelledby="workspaces-heading" className="border-t pt-8">
              <Card className="p-6">
                <CardTitle id="workspaces-heading" className="text-xl font-semibold">
                  Workspaces
                </CardTitle>
                <CardDescription className="text-xs mb-4">
                  All active curriculum and departmental workspaces.
                </CardDescription>

                <ul className="space-y-3">
                  {workspaces.map((workspace) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/30"
                      key={workspace.id}
                    >
                      <div>
                        <p className="font-semibold text-sm text-foreground">{workspace.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {workspace.course_count} courses · Created {new Date(workspace.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="xs"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => void deleteWorkspace(workspace)}
                        type="button"
                      >
                        <Trash2 className="size-3 mr-1" />
                        Delete workspace
                      </Button>
                    </li>
                  ))}
                  {workspaces.length === 0 && (
                    <li className="rounded-xl border p-4 text-sm text-muted-foreground">
                      No workspaces found.
                    </li>
                  )}
                </ul>
              </Card>
            </section>

            {/* Audit Logs Section */}
            <section id="audit-section" aria-labelledby="audit-heading" className="border-t pt-8">
              <Card className="p-6">
                <CardTitle id="audit-heading" className="text-xl font-semibold">
                  Audit logs
                </CardTitle>
                <CardDescription className="text-xs mb-4">
                  Security log of administrative changes, actions, and authorizations.
                </CardDescription>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[42rem] text-left text-xs">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 font-semibold uppercase tracking-wider text-foreground">Time</th>
                        <th className="p-3 font-semibold uppercase tracking-wider text-foreground">Actor</th>
                        <th className="p-3 font-semibold uppercase tracking-wider text-foreground">Action</th>
                        <th className="p-3 font-semibold uppercase tracking-wider text-foreground">Resource</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {auditLogs.map((entry) => (
                        <tr className="hover:bg-muted/30 transition-colors" key={entry.id}>
                          <td className="p-3 whitespace-nowrap text-muted-foreground">
                            {new Date(entry.created_at).toLocaleString()}
                          </td>
                          <td className="p-3 font-mono break-all text-foreground">{entry.actor_id}</td>
                          <td className="p-3 font-medium text-foreground">{entry.action}</td>
                          <td className="p-3 text-muted-foreground">
                            {entry.resource_type}
                            {entry.resource_id ? ` · ${entry.resource_id}` : ""}
                          </td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 && (
                        <tr>
                          <td className="p-4 text-muted-foreground text-center" colSpan={4}>
                            No audit events have been recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
