"use client";

import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";

import { apiFetch, apiRequest } from "@/lib/api";

const documentSchema = z.object({
  id: z.string().uuid(),
  source_filename: z.string(),
  title: z.string().nullable(),
  mime_type: z.string(),
  course_id: z.string().nullable(),
  created_at: z.string(),
});

const uploadResponseSchema = z.object({
  id: z.string().uuid(),
  source_filename: z.string(),
  status: z.string(),
});

const agentEventSchema = z.object({
  request_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  event_type: z.string(),
  message: z.string(),
  agent: z.string().nullable(),
  occurred_at: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

type DocumentInfo = z.infer<typeof documentSchema>;
type AgentEvent = z.infer<typeof agentEventSchema>;
type Source = Record<string, unknown>;
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

async function consumeAgentStream(
  response: Response,
  onEvent: (agentEvent: AgentEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The agent stream returned no response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  const dispatch = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    const agentEvent = agentEventSchema.parse(JSON.parse(data));
    onEvent(agentEvent);
    if (agentEvent.event_type === "response_ready") completed = true;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let frameEnd = buffer.indexOf("\n\n");
      while (frameEnd !== -1) {
        dispatch(buffer.slice(0, frameEnd));
        buffer = buffer.slice(frameEnd + 2);
        frameEnd = buffer.indexOf("\n\n");
      }
      if (done) {
        if (buffer.trim()) dispatch(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!completed) throw new Error("The agent stream ended before an answer was ready");
}

function sourceLabel(source: Source): string {
  const filename = source.source_filename;
  const page = source.page_number;
  const citation = source.citation;
  if (typeof citation === "string" && citation.length > 0) return citation;
  if (typeof filename === "string") {
    return typeof page === "number" ? `${filename}, page ${page}` : filename;
  }
  return "Source";
}

export default function WorkspaceContent() {
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const conversationId = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [prompt, setPrompt] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: string;
      source_filename: string;
      page_number: number | null;
      content: string;
    }>
  >([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const fetchDocuments = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("No active session token was returned");
    return apiRequest(
      "/api/v1/documents",
      z.array(documentSchema),
      { accessToken: token },
    );
  }, [getToken]);

  useEffect(() => {
    if (!authLoaded || !userLoaded) return;

    let active = true;
    void fetchDocuments()
      .then((result) => {
        if (active) setDocuments(result);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not load documents");
        }
      })
      .finally(() => {
        if (active) setLoadingDocuments(false);
      });
    return () => {
      active = false;
    };
  }, [authLoaded, fetchDocuments, refresh, userLoaded]);

  async function uploadSelectedFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No active session token was returned");
      const data = new FormData();
      data.append("file", file);
      await apiRequest("/api/v1/documents", uploadResponseSchema, {
        accessToken: token,
        method: "POST",
        body: data,
      });
      setLoadingDocuments(true);
      setRefresh((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Document upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function deleteDocument(document: DocumentInfo) {
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No active session token was returned");
      const response = await apiFetch(
        `/api/v1/documents/${document.id}`,
        { accessToken: token, method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(`Document deletion failed: ${response.status}`);
      }
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Document deletion failed");
    }
  }

  async function searchLibrary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No active session token was returned");
      const result = await apiRequest(
        "/api/v1/documents/search",
        z.array(
          z.object({
            id: z.string().uuid(),
            source_filename: z.string(),
            page_number: z.number().nullable(),
            content: z.string(),
          }),
        ),
        {
          accessToken: token,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchText, top_k: 5 }),
        },
      );
      setSearchResults(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Document search failed");
    } finally {
      setSearching(false);
    }
  }

  async function sendQuestion(question: string, retry = false) {
    const trimmed = question.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    setAgentEvents([]);
    if (!retry) {
      setMessages((current) => [...current, { role: "user", content: trimmed }]);
      setLastPrompt(trimmed);
      setPrompt("");
    }
    try {
      const token = await getToken();
      if (!token) throw new Error("No active session token was returned");
      conversationId.current ??= crypto.randomUUID();
      const response = await apiFetch("/api/v1/agents/stream", {
          accessToken: token,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversationId.current,
            message: trimmed,
          }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const detail =
          typeof body === "object" &&
          body !== null &&
          "detail" in body &&
          typeof body.detail === "string"
            ? body.detail
            : `AI request failed: ${response.status}`;
        throw new Error(detail);
      }
      if (!response.body) throw new Error("The agent stream returned no response body");
      await consumeAgentStream(response, (agentEvent) => {
        setAgentEvents((current) => [...current, agentEvent]);
        if (agentEvent.event_type === "response_ready") {
          setMessages((current) => [
            ...current,
            {
              role: "assistant",
              content: agentEvent.message,
              sources: getSources(agentEvent),
            },
          ]);
        }
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The AI request failed");
    } finally {
      setSending(false);
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(prompt);
  }

  function getSources(agentEvent: AgentEvent): Source[] {
    const result = z.array(z.record(z.string(), z.unknown())).safeParse(
      agentEvent.metadata.sources,
    );
    return result.success ? result.data : [];
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
      <header className="mb-8 flex items-center justify-between border-b pb-5">
        <div>
          <Link className="text-sm font-semibold text-primary" href="/dashboard">
            UniMind AI
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">AI workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Private knowledge and multi-agent chat
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {user?.fullName ?? user?.primaryEmailAddress?.emailAddress}
          </span>
          <UserButton />
        </div>
      </header>

      {error && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive" role="alert">{error}</p>
          {lastPrompt && !sending && (
            <button
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              onClick={() => void sendQuestion(lastPrompt, true)}
              type="button"
            >
              Retry question
            </button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <section className="flex min-h-[36rem] flex-col rounded-2xl border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Ask your university assistant</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Answers use your private documents and include available citations.
            </p>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
            {messages.length === 0 && (
              <p className="rounded-xl bg-muted/60 p-4 text-sm leading-6 text-muted-foreground">
                Upload a PDF or another supported document, then ask a question
                about its contents.
              </p>
            )}
            {messages.map((message, index) => (
              <article
                className={`rounded-xl p-4 ${
                  message.role === "user" ? "ml-8 bg-primary/10" : "mr-4 bg-muted/60"
                }`}
                key={`${message.role}-${index}`}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {message.role === "user" ? "You" : "UniMind"}
                </p>
                <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                {!!message.sources?.length && (
                  <div className="mt-4 border-t pt-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      Sources
                    </p>
                    <ul className="space-y-1">
                      {message.sources.map((source, sourceIndex) => (
                        <li className="text-xs text-muted-foreground" key={sourceIndex}>
                          {sourceLabel(source)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
            {sending && (
              <p className="text-sm text-muted-foreground" role="status">
                UniMind agents are working…
              </p>
            )}
            {agentEvents.filter((agentEvent) => agentEvent.event_type !== "response_ready").length > 0 && (
              <ol aria-label="Agent execution timeline" className="space-y-2 border-l pl-4">
                {agentEvents
                  .filter((agentEvent) => agentEvent.event_type !== "response_ready")
                  .map((agentEvent, index) => (
                    <li className="text-xs text-muted-foreground" key={`${agentEvent.request_id}-${index}`}>
                      <span className="font-medium">
                        {agentEvent.agent ?? agentEvent.event_type.replaceAll("_", " ")}
                      </span>
                      {" · "}
                      {agentEvent.message}
                    </li>
                  ))}
              </ol>
            )}
          </div>
          <form className="border-t p-4" onSubmit={submitQuestion}>
            <label className="sr-only" htmlFor="question">Ask a question</label>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={sending}
                id="question"
                maxLength={4096}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask a question about your materials…"
                value={prompt}
              />
              <button
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                disabled={sending || !prompt.trim()}
                type="submit"
              >
                Send
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border bg-card p-5" id="documents">
            <h2 className="font-semibold">Your document library</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Files are private to your account and indexed before upload completes.
            </p>
            <input
              accept=".pdf,.docx,.pptx,.txt,.md"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadSelectedFile(file);
              }}
              ref={fileInput}
              type="file"
            />
            <button
              className="mt-4 w-full rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              {uploading ? "Processing document…" : "Upload a document"}
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              PDF, DOCX, PPTX, TXT, or Markdown · up to 20 MB
            </p>

            <div className="mt-5 space-y-2">
              {loadingDocuments && (
                <p className="text-sm text-muted-foreground" role="status">
                  Loading documents…
                </p>
              )}
              {!loadingDocuments && documents.length === 0 && (
                <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  No documents uploaded yet.
                </p>
              )}
              {documents.map((document) => (
                <div className="flex items-start justify-between gap-3 rounded-lg border p-3" key={document.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{document.title ?? document.source_filename}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Indexed · {new Date(document.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    aria-label={`Delete ${document.source_filename}`}
                    className="shrink-0 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => void deleteDocument(document)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Search your sources</h2>
            <form className="mt-3 space-y-2" onSubmit={(event) => void searchLibrary(event)}>
              <label className="sr-only" htmlFor="document-search">Search documents</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="document-search"
                maxLength={4096}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search indexed material…"
                value={searchText}
              />
              <button
                className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium disabled:opacity-50"
                disabled={searching || !searchText.trim()}
                type="submit"
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </form>
            {searchResults.length > 0 && (
              <ul className="mt-4 space-y-3">
                {searchResults.map((result) => (
                  <li className="border-t pt-3" key={result.id}>
                    <p className="text-xs font-medium text-muted-foreground">
                      {result.source_filename}
                      {result.page_number ? ` · page ${result.page_number}` : ""}
                    </p>
                    <p className="mt-1 line-clamp-4 text-sm leading-5">{result.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
