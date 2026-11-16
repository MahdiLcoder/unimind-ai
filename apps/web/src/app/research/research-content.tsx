"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { apiFetch, apiRequest } from "@/lib/api";

const paperSchema = z.object({
  id: z.string().uuid(),
  external_id: z.string().nullable(),
  title: z.string(),
  abstract: z.string().nullable(),
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);

  const accessToken = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("No active session token was returned");
    return token;
  }, [getToken]);

  const loadPapers = useCallback(async () => {
    const token = await accessToken();
    setPapers(await apiRequest("/api/v1/research/papers", z.array(paperSchema), { accessToken: token }));
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
      setNotice(`${results.length} Crossref record${results.length === 1 ? "" : "s"} saved to your research library.`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
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
    } catch (cause) {
      setError(message(cause));
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
    } catch (cause) {
      setError(message(cause));
    }
  }

  const bibliography = papers.map(apaCitation).join("\n");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between border-b pb-6">
        <div>
          <Link className="text-sm text-muted-foreground hover:text-foreground" href="/dashboard">Dashboard</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Research studio</h1>
          <p className="mt-2 text-muted-foreground">Discover and save Crossref papers, then request an evidence-grounded review.</p>
        </div>
        <UserButton />
      </header>

      {error && <p className="mt-6 rounded-lg border border-destructive/40 p-4 text-sm" role="alert">{error}</p>}
      {notice && <p className="mt-6 rounded-lg border p-4 text-sm" role="status">{notice}</p>}

      <form className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={search}>
        <label className="sr-only" htmlFor="paper-query">Search academic papers</label>
        <input
          className="h-11 min-w-0 rounded-md border bg-background px-3"
          id="paper-query"
          maxLength={300}
          minLength={2}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search papers by topic, title, author, or DOI"
          required
          value={query}
        />
        <button className="h-11 rounded-md bg-primary px-5 text-primary-foreground disabled:opacity-60" disabled={busy} type="submit">
          {busy ? "Working…" : "Search papers"}
        </button>
      </form>

      {papers.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Research library</h2>
            <button className="rounded-md border px-4 py-2 text-sm disabled:opacity-60" disabled={busy || query.trim().length < 2} onClick={() => void requestReview()} type="button">
              Generate literature review
            </button>
          </div>
          <ul className="mt-4 space-y-3">
            {papers.map((paper) => (
              <li className="rounded-xl border p-5" key={paper.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{paper.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {paper.authors.join(", ") || "Author not listed"}{paper.year ? ` · ${paper.year}` : ""}
                    </p>
                  </div>
                  <button className="rounded-md border px-3 py-2 text-sm" onClick={() => void removePaper(paper)} type="button">Remove</button>
                </div>
                {paper.abstract && <p className="mt-3 text-sm leading-6">{paper.abstract}</p>}
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  {paper.doi && <a className="underline" href={`https://doi.org/${encodeURIComponent(paper.doi)}`} rel="noreferrer" target="_blank">DOI</a>}
                  {paper.url && <a className="underline" href={paper.url} rel="noreferrer" target="_blank">Publisher record</a>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {review && <section className="mt-8 rounded-xl border p-5" aria-live="polite">
        <h2 className="text-xl font-semibold">Literature review</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{review}</p>
      </section>}

      {papers.length > 0 && <section className="mt-8 rounded-xl border p-5">
        <h2 className="font-semibold">Bibliography</h2>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-6">{bibliography}</pre>
      </section>}

      {!loading && papers.length === 0 && <p className="mt-8 rounded-xl border p-5 text-sm text-muted-foreground">No saved research papers yet. Search Crossref to begin.</p>}
    </main>
  );
}
