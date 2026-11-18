"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Trash2,
  Search,
  Send,
  Sparkles,
  Bot,
  User,
  RefreshCw,
  FileCheck,
  AlertCircle,
  Copy,
  Eraser,
  History,
  MessageSquare,
  Plus,
} from "lucide-react";

import { apiFetch, apiRequest } from "@/lib/api";
import { validateUploadFile } from "@/lib/upload";
import { SiteHeader } from "@/components/site-header";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
const courseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});
const conversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
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
const conversationHistorySchema = z.object({
  conversation_id: z.string().uuid(),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
      sources: z.array(z.record(z.string(), z.unknown())).default([]),
    })
  ),
  events: z.array(agentEventSchema),
});

type DocumentInfo = z.infer<typeof documentSchema>;
type AgentEvent = z.infer<typeof agentEventSchema>;
type Course = z.infer<typeof courseSchema>;
type Conversation = z.infer<typeof conversationSchema>;
type Source = Record<string, unknown>;
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

async function consumeAgentStream(
  response: Response,
  onEvent: (agentEvent: AgentEvent) => void
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
  const { isLoaded: userLoaded } = useUser();
  const conversationId = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
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
    return apiRequest("/api/v1/documents", z.array(documentSchema), { accessToken: token });
  }, [getToken]);

  const fetchConversations = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("No active session token was returned");
    return apiRequest("/api/v1/agents/conversations", z.array(conversationSchema), {
      accessToken: token,
    });
  }, [getToken]);

  useEffect(() => {
    if (!authLoaded || !userLoaded) return;

    let active = true;
    void Promise.all([
      fetchDocuments(),
      getToken().then((token) => {
        if (!token) throw new Error("No active session token was returned");
        return apiRequest("/api/v1/courses", z.array(courseSchema), { accessToken: token });
      }),
      fetchConversations(),
    ])
      .then(([documentList, courseList, conversationList]) => {
        if (!active) return;
        setDocuments(documentList);
        setCourses(courseList);
        setConversations(conversationList);
        const requestedCourseId = typeof window === "undefined"
          ? ""
          : new URLSearchParams(window.location.search).get("course") ?? "";
        setSelectedCourseId((current) =>
          current || (courseList.some((course) => course.id === requestedCourseId)
            ? requestedCourseId
            : "")
        );
      })
      .catch((cause: unknown) => {
        if (active) {
          const err = cause instanceof Error ? cause.message : "Could not load documents";
          setError(err);
          toast.error(err);
        }
      })
      .finally(() => {
        if (active) setLoadingDocuments(false);
      });
    return () => {
      active = false;
    };
  }, [authLoaded, fetchConversations, fetchDocuments, getToken, refresh, userLoaded]);

  async function uploadSelectedFile(file: File) {
    const validationError = validateUploadFile(file);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
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
        timeoutMs: 180_000,
      });
      setLoadingDocuments(true);
      setRefresh((count) => count + 1);
      toast.success(`Uploaded and indexed ${file.name}`);
    } catch (cause) {
      const err = cause instanceof Error ? cause.message : "Document upload failed";
      setError(err);
      toast.error(err);
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
      const response = await apiFetch(`/api/v1/documents/${document.id}`, {
        accessToken: token,
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Document deletion failed: ${response.status}`);
      }
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      toast.success(`Deleted ${document.source_filename}`);
    } catch (cause) {
      const err = cause instanceof Error ? cause.message : "Document deletion failed";
      setError(err);
      toast.error(err);
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
          })
        ),
        {
          accessToken: token,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchText,
            top_k: 5,
            course_id: selectedCourseId || null,
          }),
        }
      );
      setSearchResults(result);
      toast.info(`Found ${result.length} relevant sections`);
    } catch (cause) {
      const err = cause instanceof Error ? cause.message : "Document search failed";
      setError(err);
      toast.error(err);
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
      if (!conversationId.current) {
        conversationId.current = crypto.randomUUID();
        setActiveConversationId(conversationId.current);
      }
      const response = await apiFetch("/api/v1/agents/stream", {
        accessToken: token,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId.current,
          message: trimmed,
          course_id: selectedCourseId || null,
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
      setConversations(await fetchConversations());
    } catch (cause) {
      const err = cause instanceof Error ? cause.message : "The AI request failed";
      setError(err);
      toast.error(err);
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
      agentEvent.metadata.sources
    );
    return result.success ? result.data : [];
  }

  async function loadConversation(conversation: Conversation) {
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No active session token was returned");
      const history = await apiRequest(
        `/api/v1/agents/conversations/${conversation.id}/history`,
        conversationHistorySchema,
        { accessToken: token }
      );
      conversationId.current = history.conversation_id;
      setActiveConversationId(history.conversation_id);
      setMessages(
        history.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({
            role: message.role as Message["role"],
            content: message.content,
            sources: message.sources,
          }))
      );
      setAgentEvents(history.events);
      setLastPrompt(
        [...history.messages].reverse().find((message) => message.role === "user")?.content ?? ""
      );
      toast.success(`Loaded ${conversation.title}`);
    } catch (cause) {
      const err = cause instanceof Error ? cause.message : "Could not load conversation";
      setError(err);
      toast.error(err);
    }
  }

  async function deleteConversation(conversation: Conversation) {
    try {
      const token = await getToken();
      if (!token) throw new Error("No active session token was returned");
      const response = await apiFetch(`/api/v1/agents/conversations/${conversation.id}`, {
        accessToken: token,
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`Could not delete conversation (${response.status})`);
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      if (conversationId.current === conversation.id) {
        conversationId.current = null;
        setActiveConversationId(null);
        setMessages([]);
        setAgentEvents([]);
      }
      toast.success("Conversation deleted");
    } catch (cause) {
      const err = cause instanceof Error ? cause.message : "Could not delete conversation";
      setError(err);
      toast.error(err);
    }
  }

  function startNewChat() {
    conversationId.current = crypto.randomUUID();
    setActiveConversationId(conversationId.current);
    setMessages([]);
    setAgentEvents([]);
    setLastPrompt("");
    setError(null);
    toast.info("Started a new chat");
  }

  const visibleDocuments = documents.filter((document) =>
    !selectedCourseId || document.course_id === null || document.course_id === selectedCourseId
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
        <PageHeader
          title="AI Workspace"
          description="Grounded multi-agent academic assistant with verified citations from your course documents"
          className="mb-8"
        />

        {error && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm" role="alert">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 text-destructive shrink-0" />
              <p className="text-destructive font-medium">{error}</p>
            </div>
            {lastPrompt && !sending && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void sendQuestion(lastPrompt, true)}
                type="button"
              >
                <RefreshCw className="size-3.5" />
                Retry question
              </Button>
            )}
          </div>
        )}

        <div className={`grid gap-6 ${historyOpen ? "lg:grid-cols-[15rem_minmax(0,1.4fr)_minmax(18rem,0.8fr)]" : "lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]"}`}>
          {historyOpen && (
            <aside aria-label="Conversation history">
              <Card className="p-4 lg:sticky lg:top-20">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <History className="size-4" /> Conversations
                  </CardTitle>
                  <Button aria-label="New chat" size="xs" variant="ghost" onClick={startNewChat} type="button">
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="mt-3 max-h-[34rem] space-y-1 overflow-y-auto">
                  {conversations.map((conversation) => (
                    <div className="flex items-center gap-1" key={conversation.id}>
                      <button
                        className={`min-w-0 flex-1 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-muted ${activeConversationId === conversation.id ? "bg-muted" : ""}`}
                        onClick={() => void loadConversation(conversation)}
                        type="button"
                      >
                        <span className="block truncate font-medium">{conversation.title}</span>
                        <span className="mt-1 block text-[10px] text-muted-foreground">
                          {new Date(conversation.updated_at).toLocaleDateString()}
                        </span>
                      </button>
                      <Button
                        aria-label={`Delete ${conversation.title}`}
                        size="xs"
                        variant="ghost"
                        onClick={() => void deleteConversation(conversation)}
                        type="button"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                  {conversations.length === 0 && (
                    <p className="px-2 py-4 text-xs text-muted-foreground">No saved conversations.</p>
                  )}
                </div>
              </Card>
            </aside>
          )}
          {/* Chat Assistant Section */}
          <Card className="flex min-h-[38rem] flex-col">
            <CardHeader className="border-b px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Sparkles className="size-4 text-primary" />
                    Ask your university assistant
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs text-muted-foreground">
                    Answers use your private documents and include available citations.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    aria-label={historyOpen ? "Hide conversation history" : "Show conversation history"}
                    size="xs"
                    variant="ghost"
                    onClick={() => setHistoryOpen((open) => !open)}
                    type="button"
                  >
                    <MessageSquare className="size-4" />
                  </Button>
                  <Button size="xs" variant="outline" onClick={startNewChat} type="button">
                    <Plus className="size-3.5" /> New Chat
                  </Button>
                  {messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setMessages([]);
                        setAgentEvents([]);
                        conversationId.current = null;
                        setActiveConversationId(null);
                        toast.info("Conversation cleared.");
                      }}
                      type="button"
                    >
                      <Eraser className="size-3.5" />
                      Clear
                    </Button>
                  )}
                  {sending && (
                    <Badge variant="secondary" className="animate-pulse text-[10px]">
                      Multi-Agent Active
                    </Badge>
                  )}
                </div>
              </div>
              {courses.length > 0 && (
                <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  Filter by course
                  <select
                    aria-label="Filter by course"
                    className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    onChange={(event) => setSelectedCourseId(event.target.value)}
                    value={selectedCourseId}
                  >
                    <option value="">All courses</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} · {course.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </CardHeader>

            <CardContent className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full min-h-[18rem] text-center p-6">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
                    <Sparkles className="size-6" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">Grounded AI Conversations</h3>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Upload course syllabi, lecture slides, or notes to ask questions with ground-truth citations.
                  </p>
                  <div className="mt-6 w-full max-w-md space-y-2 text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                      Suggested prompts
                    </p>
                    {[
                      "Summarize key concepts from my documents",
                      "Extract all assignment deadlines and exam dates",
                      "Generate 5 practice review questions with solutions",
                      "Explain the hardest concept using a simple analogy",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          setPrompt(suggestion);
                        }}
                        className="w-full text-left rounded-lg border border-border/70 bg-card p-2.5 text-xs text-foreground transition-all hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                      >
                        <span className="text-primary mr-1.5 font-bold">✦</span>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <article
                  className={`flex flex-col rounded-xl p-4 transition-colors ${
                    message.role === "user"
                      ? "ml-8 bg-primary/10 border border-primary/20"
                      : "mr-4 bg-muted/40 border border-border/60"
                  }`}
                  key={`${message.role}-${index}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      {message.role === "user" ? (
                        <User className="size-3.5 text-primary" />
                      ) : (
                        <Bot className="size-3.5 text-primary" />
                      )}
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {message.role === "user" ? "You" : "UniMind"}
                      </span>
                    </div>
                    {message.role === "assistant" && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                        onClick={() => {
                          void navigator.clipboard.writeText(message.content);
                          toast.success("Answer copied to clipboard!");
                        }}
                        aria-label="Copy answer"
                        type="button"
                      >
                        <Copy className="size-3" />
                      </Button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {message.content}
                  </p>
                  {!!message.sources?.length && (
                    <div className="mt-4 border-t pt-3">
                      <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <FileCheck className="size-3 text-primary" />
                        Sources
                      </p>
                      <ul className="space-y-1">
                        {message.sources.map((source, sourceIndex) => (
                          <li
                            className="text-xs text-muted-foreground bg-background/60 rounded px-2 py-1 border border-border/40"
                            key={sourceIndex}
                          >
                            {sourceLabel(source)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              ))}

              {sending && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground" role="status">
                  <RefreshCw className="size-3.5 animate-spin text-primary" />
                  <span>UniMind agents are working…</span>
                </div>
              )}

              {agentEvents.filter((agentEvent) => agentEvent.event_type !== "response_ready").length > 0 && (
                <ol aria-label="Agent execution timeline" className="space-y-2 border-l border-primary/30 pl-4 my-2">
                  {agentEvents
                    .filter((agentEvent) => agentEvent.event_type !== "response_ready")
                    .map((agentEvent, index) => (
                      <li className="text-xs text-muted-foreground" key={`${agentEvent.request_id}-${index}`}>
                        <span className="font-medium text-foreground">
                          {agentEvent.agent ?? agentEvent.event_type.replaceAll("_", " ")}
                        </span>
                        {" · "}
                        {agentEvent.message}
                      </li>
                    ))}
                </ol>
              )}
            </CardContent>

            <form className="border-t p-4" onSubmit={submitQuestion}>
              <label className="sr-only" htmlFor="question">
                Ask a question
              </label>
              <div className="flex gap-2">
                <Input
                  className="min-w-0 flex-1 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={sending}
                  id="question"
                  maxLength={4096}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Ask a question about your materials…"
                  value={prompt}
                />
                <Button
                  disabled={sending || !prompt.trim()}
                  type="submit"
                  size="default"
                  className="gap-1.5 shrink-0"
                >
                  <Send className="size-3.5" />
                  Send
                </Button>
              </div>
            </form>
          </Card>

          {/* Right Sidebar: Documents & Search */}
          <aside className="space-y-6">
            {/* Document Library */}
            <Card id="documents" className="p-5">
              <CardTitle className="text-base font-semibold">Your document library</CardTitle>
              <CardDescription className="mt-1 text-xs text-muted-foreground">
                Files are private to your account and indexed before upload completes.
              </CardDescription>

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

              <Button
                variant="outline"
                className="mt-4 w-full gap-2 text-sm font-medium"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                type="button"
              >
                <Upload className="size-4" />
                {uploading ? "Processing document…" : "Upload a document"}
              </Button>

              <p className="mt-2 text-xs text-muted-foreground">
                PDF, DOCX, PPTX, TXT, or Markdown · up to 20 MB
              </p>

              <div className="mt-5 space-y-2">
                {loadingDocuments && (
                  <div className="space-y-2" role="status">
                    <Skeleton className="h-12 w-full rounded-lg" />
                    <Skeleton className="h-12 w-full rounded-lg" />
                    <span className="sr-only">Loading documents…</span>
                  </div>
                )}
                {!loadingDocuments && visibleDocuments.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4 text-center">
                    <FileText className="mx-auto size-5 text-muted-foreground/60" />
                    <p className="mt-2 text-xs font-medium text-foreground">No documents uploaded yet</p>
                    <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                      Upload course slides, syllabus, or notes to chat with grounded citations.
                    </p>
                  </div>
                )}
                {visibleDocuments.map((document) => (
                  <div
                    className="flex items-start justify-between gap-3 rounded-lg border bg-card/60 p-3 transition-colors hover:bg-muted/40"
                    key={document.id}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <FileText className="size-4 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {document.title ?? document.source_filename}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Indexed · {new Date(document.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      aria-label={`Delete ${document.source_filename}`}
                      variant="ghost"
                      size="xs"
                      className="shrink-0 text-destructive hover:bg-destructive/10"
                      onClick={() => void deleteDocument(document)}
                      type="button"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            {/* Semantic Search in Sources */}
            <Card className="p-5 shadow-xs">
              <CardTitle className="text-base font-semibold">Search your sources</CardTitle>
              <form className="mt-3 space-y-2" onSubmit={(event) => void searchLibrary(event)}>
                <label className="sr-only" htmlFor="document-search">
                  Search documents
                </label>
                <Input
                  className="w-full text-sm focus-visible:ring-2 focus-visible:ring-ring"
                  id="document-search"
                  maxLength={4096}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search indexed material…"
                  value={searchText}
                />
                <Button
                  variant="secondary"
                  className="w-full gap-2 text-sm font-medium"
                  disabled={searching || !searchText.trim()}
                  type="submit"
                >
                  <Search className="size-3.5" />
                  {searching ? "Searching…" : "Search"}
                </Button>
              </form>

              {searchResults.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {searchResults.map((result) => (
                    <li className="border-t pt-3" key={result.id}>
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <FileText className="size-3 text-primary" />
                        {result.source_filename}
                        {result.page_number ? ` · page ${result.page_number}` : ""}
                      </p>
                      <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-foreground bg-muted/30 p-2 rounded">
                        {result.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
