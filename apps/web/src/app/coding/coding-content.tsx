"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { apiRequest } from "@/lib/api";

const responseSchema = z.object({
  conversation_id: z.string().uuid(),
  request_id: z.string().uuid(),
  intent: z.string(),
  selected_agents: z.array(z.string()),
  response: z.string(),
  sources: z.array(z.record(z.string(), z.unknown())),
});
const executionSchema = z.object({
  exit_code: z.number().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  timed_out: z.boolean(),
});

const modes = [
  ["tutor", "Programming tutor"],
  ["generate", "Code generation"],
  ["review", "Code review"],
  ["debug", "Debugging"],
  ["challenge", "Create a challenge"],
  ["evaluate", "Evaluate my solution"],
] as const;
const modeSchema = z.enum(["tutor", "generate", "review", "debug", "challenge", "evaluate"]);
type Mode = z.infer<typeof modeSchema>;

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The request could not be completed";
}

export default function CodingContent() {
  const { getToken } = useAuth();
  const [mode, setMode] = useState<Mode>("tutor");
  const [language, setLanguage] = useState("Python");
  const [question, setQuestion] = useState("");
  const [code, setCode] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [execution, setExecution] = useState<z.infer<typeof executionSchema> | null>(null);
  const [executionBusy, setExecutionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAnswer(null);
    setBusy(true);
    try {
      const accessToken = await getToken();
      if (!accessToken) throw new Error("No active session token was returned");
      const modeLabel = modes.find(([value]) => value === mode)?.[1] ?? "Programming help";
      const prompt = [
        `${modeLabel} request.`,
        `Language: ${language.trim() || "unspecified"}.`,
        `Question or requirements: ${question.trim()}`,
        code.trim() ? `Code or proposed solution:\n${code.trim()}` : "",
      ].filter(Boolean).join("\n\n");
      if (prompt.length > 4096) {
        throw new Error("Shorten the request or code snippet to fit the 4,096-character limit.");
      }
      const result = await apiRequest("/api/v1/agents", responseSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId ?? crypto.randomUUID(),
          message: prompt,
        }),
        accessToken,
      });
      setConversationId(result.conversation_id);
      setAnswer(result.response);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function executeCode() {
    setError(null);
    setExecution(null);
    if (language.trim().toLowerCase() !== "python") {
      setError("The isolated runner currently supports Python only.");
      return;
    }
    if (!code.trim()) {
      setError("Enter Python code before running it.");
      return;
    }
    setExecutionBusy(true);
    try {
      const accessToken = await getToken();
      if (!accessToken) throw new Error("No active session token was returned");
      const result = await apiRequest("/api/v1/coding/execute", executionSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        accessToken,
      });
      setExecution(result);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setExecutionBusy(false);
    }
  }

  function newConversation() {
    setConversationId(null);
    setAnswer(null);
    setExecution(null);
    setError(null);
    setQuestion("");
    setCode("");
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between border-b pb-6">
        <div>
          <Link className="text-sm text-muted-foreground hover:text-foreground" href="/dashboard">Dashboard</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Coding lab</h1>
          <p className="mt-2 text-muted-foreground">Learn, generate, review, and debug code with the Coding Agent.</p>
        </div>
        <UserButton />
      </header>

      <p className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm" role="note">
        Python runs in a short-lived, non-root container with no network access and bounded CPU, memory, time, and output. Only Python standard-library code is available.
      </p>
      {error && <p className="mt-4 rounded-lg border border-destructive/40 p-4 text-sm" role="alert">{error}</p>}

      <form className="mt-6 grid gap-4 rounded-2xl border p-5 sm:grid-cols-2" onSubmit={submit}>
        <div>
          <label className="mb-2 block text-sm" htmlFor="coding-mode">Activity</label>
          <select className="h-10 w-full rounded-md border bg-background px-3" id="coding-mode" onChange={(event) => setMode(modeSchema.parse(event.target.value))} value={mode}>
            {modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm" htmlFor="coding-language">Language</label>
          <input className="h-10 w-full rounded-md border bg-background px-3" id="coding-language" maxLength={50} onChange={(event) => setLanguage(event.target.value)} value={language} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm" htmlFor="coding-question">Question or requirements</label>
          <textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2" id="coding-question" maxLength={1200} onChange={(event) => setQuestion(event.target.value)} required value={question} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm" htmlFor="coding-code">Code or proposed solution (optional)</label>
          <textarea className="min-h-48 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm" id="coding-code" maxLength={2800} onChange={(event) => setCode(event.target.value)} spellCheck={false} value={code} />
        </div>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button className="h-10 rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-60" disabled={busy} type="submit">{busy ? "Working…" : "Ask the Coding Agent"}</button>
          <button className="h-10 rounded-md border px-4 disabled:opacity-60" disabled={executionBusy} onClick={() => void executeCode()} type="button">{executionBusy ? "Running…" : "Run Python code"}</button>
          <button className="h-10 rounded-md border px-4" onClick={newConversation} type="button">New conversation</button>
        </div>
      </form>

      {execution && <section className="mt-6 rounded-2xl border p-5" aria-live="polite">
        <h2 className="font-semibold">Execution result</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {execution.timed_out ? "Stopped after the 5-second time limit." : `Exit code: ${execution.exit_code ?? "unknown"}`}
        </p>
        {execution.stdout && <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{execution.stdout}</pre>}
        {execution.stderr && <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-destructive">{execution.stderr}</pre>}
        {!execution.stdout && !execution.stderr && !execution.timed_out && <p className="mt-3 text-sm text-muted-foreground">No output.</p>}
      </section>}

      {answer && <section className="mt-6 rounded-2xl border p-5" aria-live="polite">
        <h2 className="font-semibold">Agent response</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{answer}</p>
      </section>}
    </main>
  );
}
