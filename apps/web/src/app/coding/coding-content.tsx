"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  ShieldAlert,
  Copy,
  Check,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
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
  const [copied, setCopied] = useState(false);

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
      ]
        .filter(Boolean)
        .join("\n\n");
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
      toast.success("Coding agent responded");
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function executeCode() {
    setError(null);
    setExecution(null);
    if (language.trim().toLowerCase() !== "python") {
      const err = "The isolated runner currently supports Python only.";
      setError(err);
      toast.error(err);
      return;
    }
    if (!code.trim()) {
      const err = "Enter Python code before running it.";
      setError(err);
      toast.error(err);
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
      if (result.timed_out) {
        toast.warning("Code execution timed out (5s limit)");
      } else if (result.exit_code === 0) {
        toast.success("Execution completed successfully");
      } else {
        toast.error(`Execution failed with exit code ${result.exit_code}`);
      }
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
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
    toast.info("Started new coding session");
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link className="text-xs font-semibold uppercase tracking-[0.16em] text-primary" href="/dashboard">
              Dashboard
            </Link>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Coding lab</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Learn, generate, review, and debug code with the Coding Agent.
            </p>
          </div>
          <UserButton />
        </header>

        {/* Security Sandbox Alert */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-foreground" role="note">
          <ShieldAlert className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Python runs in a short-lived, non-root container with no network access and bounded CPU, memory, time, and output. Only Python standard-library code is available.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        {/* Coding Assistant Workspace */}
        <Card className="mt-6 p-6 shadow-xs">
          <form className="grid gap-5 sm:grid-cols-2" onSubmit={submit}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground" htmlFor="coding-mode">
                Activity
              </label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="coding-mode"
                onChange={(event) => setMode(modeSchema.parse(event.target.value))}
                value={mode}
              >
                {modes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground" htmlFor="coding-language">
                Language
              </label>
              <Input
                id="coding-language"
                maxLength={50}
                onChange={(event) => setLanguage(event.target.value)}
                value={language}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-foreground" htmlFor="coding-question">
                Question or requirements
              </label>
              <Textarea
                className="min-h-24 text-sm"
                id="coding-question"
                maxLength={1200}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask how to implement an algorithm, request a code review, or describe a bug…"
                required
                value={question}
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-foreground" htmlFor="coding-code">
                  Code or proposed solution (optional)
                </label>
                <span className="text-[11px] text-muted-foreground font-mono">Max 2,800 chars</span>
              </div>
              <Textarea
                className="min-h-48 font-mono text-xs leading-relaxed bg-muted/20"
                id="coding-code"
                maxLength={2800}
                onChange={(event) => setCode(event.target.value)}
                placeholder="# Paste Python code or starter solution here..."
                spellCheck={false}
                value={code}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 pt-2 border-t">
              <Button disabled={busy} type="submit" className="gap-2">
                <Sparkles className="size-4" />
                {busy ? "Working…" : "Ask the Coding Agent"}
              </Button>
              <Button
                variant="secondary"
                disabled={executionBusy}
                onClick={() => void executeCode()}
                type="button"
                className="gap-2"
              >
                <Play className="size-4" />
                {executionBusy ? "Running…" : "Run Python code"}
              </Button>
              <Button variant="outline" onClick={newConversation} type="button" className="gap-2">
                <RotateCcw className="size-4" />
                New conversation
              </Button>
            </div>
          </form>
        </Card>

        {/* Execution Output Panel */}
        {execution && (
          <Card className="mt-6 shadow-sm border-border" aria-live="polite">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Terminal className="size-4 text-primary" />
                  Execution result
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {execution.timed_out
                    ? "Stopped after the 5-second time limit."
                    : `Exit code: ${execution.exit_code ?? "unknown"}`}
                </CardDescription>
              </div>
              <Badge
                variant={
                  execution.timed_out || (execution.exit_code !== null && execution.exit_code !== 0)
                    ? "destructive"
                    : "secondary"
                }
              >
                {execution.timed_out
                  ? "Timed Out"
                  : execution.exit_code === 0
                  ? "Success"
                  : `Exit ${execution.exit_code}`}
              </Badge>
            </CardHeader>

            <CardContent className="space-y-3">
              {execution.stdout && (
                <div>
                  <span className="text-[11px] font-mono text-muted-foreground uppercase">Stdout:</span>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/90 p-3 text-xs font-mono text-emerald-400">
                    {execution.stdout}
                  </pre>
                </div>
              )}
              {execution.stderr && (
                <div>
                  <span className="text-[11px] font-mono text-destructive uppercase">Stderr:</span>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/90 p-3 text-xs font-mono text-rose-400">
                    {execution.stderr}
                  </pre>
                </div>
              )}
              {!execution.stdout && !execution.stderr && !execution.timed_out && (
                <p className="text-xs text-muted-foreground">Process completed with no output.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Coding Agent Response Card */}
        {answer && (
          <Card className="mt-6 shadow-sm border-primary/30" aria-live="polite">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                Agent response
              </CardTitle>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => copyToClipboard(answer)}
                className="gap-1.5"
              >
                {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground bg-muted/20 p-4 rounded-lg">
                {answer}
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
