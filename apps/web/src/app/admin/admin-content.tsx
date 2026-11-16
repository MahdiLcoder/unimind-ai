"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { apiFetch, apiRequest } from "@/lib/api";

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
        },
      );
      setUsers((current) => current.map((item) => item.clerk_user_id === updated.clerk_user_id ? updated : item));
      setNotice(`Updated ${updated.email ?? updated.clerk_user_id} to ${roleLabel[role]}.`);
    } catch (cause) {
      setError(message(cause));
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
        },
      );
      setFeatures((current) => current.map((item) => item.key === updated.key ? updated : item));
      setNotice(`Feature ${updated.key} ${enabled ? "enabled" : "disabled"}.`);
      const logs = await apiRequest("/api/v1/admin/audit-logs?limit=100", z.array(auditSchema), { accessToken });
      setAuditLogs(logs);
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function deleteWorkspace(workspace: Workspace) {
    if (!window.confirm(`Delete "${workspace.name}" and its courses and course data? This cannot be undone.`)) return;
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
      setNotice(`Workspace "${workspace.name}" deleted.`);
      await load();
    } catch (cause) {
      setError(message(cause));
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between border-b pb-6">
        <div>
          <Link className="text-sm text-muted-foreground hover:text-foreground" href="/dashboard">Dashboard</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Administration</h1>
          <p className="mt-2 text-muted-foreground">Manage accounts, platform features, workspaces, and audit history.</p>
        </div>
        <UserButton />
      </header>

      {error && <p className="mt-6 rounded-lg border border-destructive/40 p-4 text-sm" role="alert">{error}</p>}
      {notice && <p className="mt-6 rounded-lg border p-4 text-sm" role="status">{notice}</p>}
      {loading && <p className="mt-6" role="status">Loading users…</p>}
      {!loading && authorized === false && <p className="mt-6 rounded-lg border p-4 text-sm" role="alert">Administrator access is required.</p>}

      {authorized && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Users</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 font-medium">Account</th>
                  <th className="p-3 font-medium">Role</th>
                  <th className="p-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr className="border-t" key={user.clerk_user_id}>
                    <td className="p-3">
                      <p>{user.email ?? "No email available"}</p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">{user.clerk_user_id}</p>
                    </td>
                    <td className="p-3">
                      <label className="sr-only" htmlFor={`role-${user.clerk_user_id}`}>Role for {user.email ?? user.clerk_user_id}</label>
                      <select
                        className="h-9 rounded-md border bg-background px-2"
                        disabled={user.clerk_user_id === self}
                        id={`role-${user.clerk_user_id}`}
                        onChange={(event) => void changeRole(user, userSchema.shape.role.parse(event.target.value))}
                        value={user.role}
                      >
                        {roles.map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}
                      </select>
                      {user.clerk_user_id === self && <span className="ml-2 text-xs text-muted-foreground">Current administrator</span>}
                    </td>
                    <td className="p-3 text-muted-foreground">{new Date(user.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {!loading && users.length === 0 && <tr><td className="p-4 text-muted-foreground" colSpan={3}>No user records found.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Role changes take effect on the next authenticated API request.
          </p>
        </section>
      )}

      {authorized && (
        <>
          <section className="mt-10 border-t pt-8">
            <h2 className="text-xl font-semibold">Platform features</h2>
            <p className="mt-1 text-sm text-muted-foreground">These switches are enforced by the API.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <li className="flex items-center justify-between gap-4 rounded-xl border p-4" key={feature.key}>
                  <span className="font-medium">{feature.key.replaceAll("_", " ")}</span>
                  <label className="flex items-center gap-2 text-sm">
                    <input checked={feature.enabled} onChange={(event) => void setFeature(feature, event.target.checked)} type="checkbox" />
                    {feature.enabled ? "Enabled" : "Disabled"}
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10 border-t pt-8">
            <h2 className="text-xl font-semibold">Workspaces</h2>
            <ul className="mt-4 space-y-2">
              {workspaces.map((workspace) => (
                <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" key={workspace.id}>
                  <div>
                    <p className="font-medium">{workspace.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{workspace.course_count} courses · Created {new Date(workspace.created_at).toLocaleDateString()}</p>
                  </div>
                  <button className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive" onClick={() => void deleteWorkspace(workspace)} type="button">Delete workspace</button>
                </li>
              ))}
              {workspaces.length === 0 && <li className="rounded-xl border p-4 text-sm text-muted-foreground">No workspaces found.</li>}
            </ul>
          </section>

          <section className="mt-10 border-t pt-8">
            <h2 className="text-xl font-semibold">Audit logs</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="bg-muted/50"><tr><th className="p-3">Time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Resource</th></tr></thead>
                <tbody>
                  {auditLogs.map((entry) => (
                    <tr className="border-t" key={entry.id}>
                      <td className="p-3">{new Date(entry.created_at).toLocaleString()}</td>
                      <td className="p-3 break-all">{entry.actor_id}</td>
                      <td className="p-3">{entry.action}</td>
                      <td className="p-3">{entry.resource_type}{entry.resource_id ? ` · ${entry.resource_id}` : ""}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && <tr><td className="p-4 text-muted-foreground" colSpan={4}>No audit events have been recorded.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
