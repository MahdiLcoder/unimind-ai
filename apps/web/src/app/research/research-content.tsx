"use client";

import { useAuth } from "@clerk/nextjs";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  FileSearch,
  Search,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  BookmarkPlus,
  Quote,
  GitCompareArrows,
} from "lucide-react";
import { apiFetch, apiRequest } from "@/lib/api";
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
import { EmptyState } from "@/components/empty-state";

const paperSchema = z.object({
  id: z.string().uuid(),
  external_id: z.string().nullable(),
  title: z.string(),
  abstract: z.string().nullable(),
  summary: z.string().nullable(),
  year: z.number().nullable(),
  authors: z.array(z.string()),
  doi: z.string().nullable(),
  url: z.string().nullable(),
  created_at: z.string(),
});
const agentResponseSchema = z.object({
  conversation_id: z.string().uuid(),
  request_id: z.string().uuid(),
  intent: z.string(),
  selected_agents: z.array(z.string()),
  response: z.string(),
  sources: z.array(z.record(z.string(), z.unknown())),
});
const searchHistorySchema = z.object({
  id: z.string().uuid(),
  query: z.string(),
  result_count: z.number(),
  created_at: z.string(),
});
const comparisonSchema = z.object({
  comparison: z.string(),
});

type Paper = z.infer<typeof paperSchema>;

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The request could not be completed";
}

function apaCitation(paper: Paper): string {
  const authors = paper.authors.length > 0 ? paper.authors.join(", ") : "Unknown author";
  const year = paper.year ? `(${paper.year})` : "(n.d.)";
  const doi = paper.doi ? ` https://doi.org/${paper.doi}` : paper.url ? ` ${paper.url}` : "";
  return `${authors} ${year}. ${paper.title}.${doi}`;
}

export default function ResearchContent() {
  const { getToken } = useAuth();
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [searchHistory, setSearchHistory] = useState<z.infer<typeof searchHistorySchema>[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [comparison, setComparison] = useState<string | null>(null);
  const [copiedDoi, setCopiedDoi] = useState<string | null>(null);
  const [summaryBusyId, setSummaryBusyId] = useState<string | null>(null);

  const accessToken = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("No active session token was returned");
    return token;
  }, [getToken]);

  const loadPapers = useCallback(async () => {
    const token = await accessToken();
    const [savedPapers, history] = await Promise.all([
      apiRequest("/api/v1/research/papers", z.array(paperSchema), {
        accessToken: token,
      }),
      apiRequest("/api/v1/research/search-history", z.array(searchHistorySchema), {
        accessToken: token,
      }),
    ]);
    setPapers(savedPapers);
    setSearchHistory(history);
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(loadPapers)
      .catch((cause: unknown) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadPapers]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setReview(null);
    setComparison(null);
    setBusy(true);
    try {
      const token = await accessToken();
      const results = await apiRequest("/api/v1/research/search", z.array(paperSchema), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 10 }),
        accessToken: token,
      });
      setPapers(results);
      await loadPapers();
      const msg = `${results.length} Crossref record${results.length === 1 ? "" : "s"} saved to your research library.`;
      setNotice(msg);
      toast.success(msg);
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function compareSelectedPapers() {
    setError(null);
    setComparison(null);
    setBusy(true);
    try {
      const token = await accessToken();
      const result = await apiRequest("/api/v1/research/compare", comparisonSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_ids: selectedPaperIds }),
        accessToken: token,
      });
      setComparison(result.comparison);
      toast.success("Saved papers compared");
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function summarizePaper(paper: Paper) {
    setError(null);
    setSummaryBusyId(paper.id);
    try {
      const token = await accessToken();
      const result = await apiRequest(
        `/api/v1/research/papers/${paper.id}/summary`,
        z.object({ summary: z.string() }),
        { method: "POST", accessToken: token }
      );
      setPapers((current) =>
        current.map((entry) =>
          entry.id === paper.id ? { ...entry, summary: result.summary } : entry
        )
      );
      toast.success("Paper summary generated and saved");
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    } finally {
      setSummaryBusyId(null);
    }
  }

  async function requestReview() {
    setError(null);
    setReview(null);
    setBusy(true);
    try {
      const token = await accessToken();
      const result = await apiRequest("/api/v1/agents", agentResponseSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: crypto.randomUUID(),
          message: `Prepare an evidence-based literature review comparing academic research about: ${query.trim()}. Identify themes and limitations, and include a concise bibliography.`,
        }),
        accessToken: token,
      });
      setReview(result.response);
      toast.success("Literature review generated");
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function removePaper(paper: Paper) {
    setError(null);
    try {
      const token = await accessToken();
      const response = await apiFetch(`/api/v1/research/papers/${paper.id}`, {
        method: "DELETE",
        accessToken: token,
      });
      if (!response.ok) throw new Error(`Could not remove paper (${response.status})`);
      setPapers((current) => current.filter((entry) => entry.id !== paper.id));
      setSelectedPaperIds((current) => current.filter((id) => id !== paper.id));
      toast.success("Paper removed from library");
    } catch (cause) {
      const err = message(cause);
      setError(err);
      toast.error(err);
    }
  }

  function copyCitation(paper: Paper) {
    const text = apaCitation(paper);
    void navigator.clipboard.writeText(text);
    setCopiedDoi(paper.id);
    toast.success("APA citation copied to clipboard");
    setTimeout(() => setCopiedDoi(null), 2000);
  }

  const bibliography = papers.map(apaCitation).join("\n\n");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
        <PageHeader
          title="Research Studio"
          description="Discover Crossref academic papers and generate evidence-grounded literature reviews for ISI Kef coursework"
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

        {/* Search Bar */}
        <form className="mt-8 flex flex-col gap-3 sm:flex-row" onSubmit={search}>
          <label className="sr-only" htmlFor="paper-query">
            Search academic papers
          </label>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-10 text-sm focus-visible:ring-2 focus-visible:ring-ring"
              id="paper-query"
              maxLength={300}
              minLength={2}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search papers by topic, title, author, or DOI (e.g. transformer attention, 10.1145/...)"
              required
              value={query}
            />
          </div>
          <Button
            className="h-11 px-6 gap-2 shrink-0"
            disabled={busy}
            type="submit"
          >
            <BookmarkPlus className="size-4" />
            {busy ? "Working…" : "Search papers"}
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium mr-1">Popular research topics:</span>
          {[
            "Vision transformers",
            "Retrieval-Augmented Generation",
            "Graph neural networks",
            "Self-supervised representation",
          ].map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => setQuery(topic)}
              className="rounded-full border border-border/70 bg-card px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
            >
              {topic}
            </button>
          ))}
        </div>

        {searchHistory.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Recent searches:</span>
            {searchHistory.slice(0, 8).map((entry) => (
              <button
                className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                key={entry.id}
                onClick={() => setQuery(entry.query)}
                type="button"
              >
                {entry.query}
              </button>
            ))}
          </div>
        )}

        {/* Research Papers List */}
        {papers.length > 0 && (
          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">Research library</h2>
                <Badge variant="secondary">{papers.length} Papers</Badge>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                disabled={busy || query.trim().length < 2}
                onClick={() => void requestReview()}
                type="button"
              >
                <Sparkles className="size-4 text-primary" />
                Generate literature review
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                disabled={busy || selectedPaperIds.length < 2}
                onClick={() => void compareSelectedPapers()}
                type="button"
              >
                <GitCompareArrows className="size-4 text-primary" />
                Compare selected ({selectedPaperIds.length}/3)
              </Button>
            </div>

            <ul className="mt-6 space-y-4">
              {papers.map((paper) => (
                <li key={paper.id}>
                  <Card className="p-5 transition-colors hover:border-border">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-base text-foreground leading-snug">
                            {paper.title}
                          </h3>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {paper.authors.join(", ") || "Author not listed"}
                          {paper.year ? ` · ${paper.year}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          disabled={summaryBusyId === paper.id}
                          onClick={() => void summarizePaper(paper)}
                          type="button"
                          variant="outline"
                          size="xs"
                        >
                          {summaryBusyId === paper.id
                            ? "Summarizing…"
                            : paper.summary
                              ? "Regenerate summary"
                              : "Summarize"}
                        </Button>
                        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            aria-label={`Select ${paper.title} for comparison`}
                            checked={selectedPaperIds.includes(paper.id)}
                            disabled={
                              !selectedPaperIds.includes(paper.id) &&
                              selectedPaperIds.length >= 3
                            }
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              setSelectedPaperIds((current) => {
                                if (checked) {
                                  return current.length < 3 ? [...current, paper.id] : current;
                                }
                                return current.filter((id) => id !== paper.id);
                              });
                            }}
                            type="checkbox"
                          />
                          Compare
                        </label>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => copyCitation(paper)}
                          className="gap-1 text-xs"
                          title="Copy APA Citation"
                        >
                          {copiedDoi === paper.id ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          <span>Cite</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => void removePaper(paper)}
                          type="button"
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3" />
                          <span className="sr-only">Remove</span>
                        </Button>
                      </div>
                    </div>

                    {paper.abstract && (
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground bg-muted/20 p-3 rounded-lg">
                        {paper.abstract}
                      </p>
                    )}
                    {paper.summary && (
                      <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <h4 className="text-xs font-semibold text-foreground">AI summary</h4>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                          {paper.summary}
                        </p>
                      </div>
                    )}

                    {comparison && (
                      <Card className="mt-8 p-6" aria-live="polite">
                        <CardHeader className="p-0 pb-4">
                          <CardTitle className="text-xl font-semibold flex items-center gap-2">
                            <GitCompareArrows className="size-5 text-primary" />
                            Saved-paper comparison
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Generated from the selected saved records and their available abstracts.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground bg-muted/20 p-4 rounded-lg">
                            {comparison}
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs border-t pt-3">
                      {paper.doi && (
                        <a
                          className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                          href={`https://doi.org/${encodeURIComponent(paper.doi)}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span>DOI: {paper.doi}</span>
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                      {paper.url && (
                        <a
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                          href={paper.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span>Publisher record</span>
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Generated Review */}
        {review && (
          <Card className="mt-8 p-6" aria-live="polite">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-xl font-semibold flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                Literature review
              </CardTitle>
              <CardDescription className="text-xs">
                AI synthesis based on saved evidence records
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground bg-muted/20 p-4 rounded-lg">
                {review}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Bibliography Section */}
        {papers.length > 0 && (
          <Card className="mt-8 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Quote className="size-4 text-primary" />
                Bibliography (APA format)
              </h2>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  void navigator.clipboard.writeText(bibliography);
                  toast.success("Full bibliography copied");
                }}
                className="gap-1.5"
              >
                <Copy className="size-3" />
                Copy all
              </Button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed font-mono bg-muted/30 p-4 rounded-lg border text-muted-foreground">
              {bibliography}
            </pre>
          </Card>
        )}

        {!loading && papers.length === 0 && (
          <div className="mt-10">
            <EmptyState
              icon={FileSearch}
              title="No saved research papers yet"
              description="Search Crossref using the query bar above to discover academic papers and generate literature reviews."
            />
          </div>
        )}
      </main>
    </div>
  );
}
