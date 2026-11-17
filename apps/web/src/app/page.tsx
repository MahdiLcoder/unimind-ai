"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  FolderKanban,
  BookOpen,
  Sparkles,
  Code2,
  FileSearch,
  Shield,
  ArrowRight,
  CheckCircle2,
  Eye,
  FileText,
  HelpCircle,
  Terminal,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";

const features = [
  {
    title: "AI Workspace & Document RAG",
    description:
      "Upload course syllabi, lecture notes, and assignments. Chat with a grounded multi-agent assistant with verified citations.",
    icon: FolderKanban,
    href: "/workspace",
    badge: "Core RAG",
  },
  {
    title: "Course Workspaces",
    description:
      "Manage academic workspaces, enrollments, student rosters, and distributed assignments in one unified interface.",
    icon: BookOpen,
    href: "/courses",
    badge: "Academic",
  },
  {
    title: "Learning Studio & Quizzes",
    description:
      "Generate custom study plans, track assignments, and take interactive auto-graded quizzes with instant feedback.",
    icon: Sparkles,
    href: "/learning",
    badge: "Study AI",
  },
  {
    title: "Coding Lab & Execution",
    description:
      "Interactive code editor with sandboxed execution, code generation, AI review, and automated programming tutoring.",
    icon: Code2,
    href: "/coding",
    badge: "Sandbox",
  },
  {
    title: "Research Studio",
    description:
      "Search academic literature via Crossref, auto-generate APA citations, and synthesize comprehensive literature reviews.",
    icon: FileSearch,
    href: "/research",
    badge: "Literature",
  },
  {
    title: "Enterprise Administration",
    description:
      "Role-based access control, security audit logging, feature flag management, and workspace governance.",
    icon: Shield,
    href: "/admin",
    badge: "Governance",
  },
];

const faqs = [
  {
    q: "How does UniMind AI prevent hallucinations in academic answers?",
    a: "UniMind uses a strict Retrieval-Augmented Generation (RAG) architecture. Agents only answer using chunks retrieved from your private documents, and every response displays exact page and section citations with confidence scores.",
  },
  {
    q: "Is student and research data private and FERPA-compliant?",
    a: "Yes. All uploaded documents, chat conversations, and course materials are isolated within your account and workspace. No data is used to train public commercial foundation models.",
  },
  {
    q: "Is code execution in the Coding Lab safe?",
    a: "Yes. Code runs inside an isolated sandbox container with strict CPU, memory, and timeout limits (maximum 10 seconds), preventing system interference and infinite loops.",
  },
  {
    q: "Can professors assign workspaces to enrolled students?",
    a: "Yes. Instructors can create course workspaces, enroll students via their university emails, and distribute assignments that link directly to course knowledge bases.",
  },
];

function subscribeToYear(): () => void {
  return () => {};
}

function getCurrentYear(): number {
  return new Date().getFullYear();
}

export default function Home() {
  const year = useSyncExternalStore(subscribeToYear, getCurrentYear, () => null);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero — deliberate, restrained */}
        <section className="relative border-b border-border/50 py-20 sm:py-28">
          <div className="relative mx-auto max-w-5xl px-6 sm:px-10">
            <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
              {/* Institution badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3.5 py-1 text-xs font-medium text-muted-foreground">
                <Eye className="size-3.5 text-primary" />
                ISI Kef · AI-Vision Club
              </div>

              <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-6xl sm:leading-[1.1]">
                Where artificial intelligence meets academic vision
              </h1>

              <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg max-w-xl">
                A connected university platform for ISI Kef — grounded document RAG, adaptive learning, sandboxed coding, and literature synthesis.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/dashboard"
                  className={buttonVariants({
                    size: "lg",
                    className: "gap-2 px-7",
                  })}
                >
                  Open dashboard
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/sign-in"
                  className={buttonVariants({ variant: "outline", size: "lg", className: "px-7" })}
                >
                  Sign in
                </Link>
              </div>

              {/* Trust indicators — inline, not cards */}
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                {[
                  "FERPA-conscious sandboxing",
                  "Ground truth citation verification",
                  "Role-based academic governance",
                ].map((text) => (
                  <div key={text} className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Feature grid — tighter, no hover gradients */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-6 sm:px-10">
            <div className="mb-10">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Platform capabilities
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Every tool is designed around ISI Kef academic workflows.
              </p>
            </div>

            <div className="grid gap-px border border-border/60 rounded-lg overflow-hidden bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Link
                    key={feature.title}
                    href={feature.href}
                    className="group relative flex flex-col bg-background p-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="size-4" />
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-border/60 font-medium"
                      >
                        {feature.badge}
                      </Badge>
                    </div>
                    <h3 className="mt-3.5 text-sm font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground flex-1">
                      {feature.description}
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                      <span>Explore</span>
                      <ArrowRight className="size-3 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Live Coding Sandbox & Terminal Section */}
        <section className="border-t border-border/50 bg-muted/20 py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-6 sm:px-10">
            <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Terminal className="size-3.5" />
                  Coding Lab & Sandbox
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Isolated execution with automated AI tutoring
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-xl">
                  Run algorithmic code safely in non-root containers with real-time complexity analysis and test assertions.
                </p>
              </div>
              <Link
                href="/coding"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <span>Launch Coding Lab</span>
                <ArrowRight className="size-3.5 ml-1.5" />
              </Link>
            </div>

            <Card className="overflow-hidden border-border/70 font-mono">
              <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-red-500/80" />
                    <span className="size-2.5 rounded-full bg-amber-500/80" />
                    <span className="size-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="ml-2 text-xs text-foreground font-semibold">
                    coding-lab / dijkstra_optimizer.py
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">Python 3.12</Badge>
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                    Sandboxed
                  </Badge>
                </div>
              </div>
              <div className="grid gap-4 p-5 lg:grid-cols-2">
                <div className="rounded-lg border bg-zinc-950 p-4 text-xs text-zinc-100 space-y-1 overflow-x-auto">
                  <div className="text-zinc-500"># UniMind AI Coding Lab · Safe execution</div>
                  <div><span className="text-purple-400">import</span> heapq</div>
                  <div className="pt-1"><span className="text-purple-400">def</span> <span className="text-blue-400">shortest_path</span>(graph, start):</div>
                  <div className="pl-4">distances = &#123;node: <span className="text-amber-400">float</span>(<span className="text-emerald-400">&quot;inf&quot;</span>) <span className="text-purple-400">for</span> node <span className="text-purple-400">in</span> graph&#125;</div>
                  <div className="pl-4">distances[start] = <span className="text-amber-400">0</span></div>
                  <div className="pl-4">pq = [(<span className="text-amber-400">0</span>, start)]</div>
                  <div className="pl-4"><span className="text-purple-400">while</span> pq:</div>
                  <div className="pl-8">curr_dist, u = heapq.heappop(pq)</div>
                  <div className="pl-8"><span className="text-purple-400">if</span> curr_dist &gt; distances[u]: <span className="text-purple-400">continue</span></div>
                  <div className="pl-8"><span className="text-purple-400">for</span> v, weight <span className="text-purple-400">in</span> graph[u].items():</div>
                  <div className="pl-12">dist = curr_dist + weight</div>
                  <div className="pl-12"><span className="text-purple-400">if</span> dist &lt; distances[v]:</div>
                  <div className="pl-16">distances[v] = dist</div>
                  <div className="pl-16">heapq.heappush(pq, (dist, v))</div>
                  <div className="pl-4"><span className="text-purple-400">return</span> distances</div>
                </div>
                <div className="flex flex-col justify-between space-y-4">
                  <div className="rounded-lg border bg-muted/40 p-4 font-mono text-xs space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground pb-2 border-b">
                      <span>Execution Terminal</span>
                      <span className="text-[10px] text-emerald-500">Exit Code: 0 (14ms)</span>
                    </div>
                    <p className="text-muted-foreground">$ python3 dijkstra_optimizer.py --benchmark</p>
                    <p className="text-emerald-500">✓ Graph initialized: 500 vertices, 2,400 edges</p>
                    <p className="text-foreground">Optimal paths computed from source node &#39;A&#39;</p>
                    <p className="text-zinc-500">Node Z min distance: 18.4 (via B -&gt; E -&gt; K -&gt; Z)</p>
                    <p className="text-emerald-500">✓ All 8 automated test assertions passed.</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card p-4 text-xs font-sans space-y-1.5">
                    <div className="flex items-center gap-1.5 font-semibold text-primary">
                      <Sparkles className="size-3.5" />
                      AI Tutor Code Review
                    </div>
                    <p className="text-muted-foreground">
                      Time complexity achieves optimal <strong className="text-foreground">O((V + E) log V)</strong> using binary min-heap priority queue. No memory leaks detected.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* How it works — workflow-oriented, not marketing */}
        <section className="border-t border-border/50 py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-6 sm:px-10">
            <div className="mb-10">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                How the platform works
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                From document ingestion to grounded AI output in three steps.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Upload course materials",
                  desc: "Index syllabi, lecture slides, textbooks, and code repositories. Documents are chunked and privately embedded.",
                  icon: FolderKanban,
                },
                {
                  step: "02",
                  title: "Multi-agent grounding",
                  desc: "Specialized agents route your query: citation verifiers check ground truth, code tutors sandbox execution, planners align with course dates.",
                  icon: FileText,
                },
                {
                  step: "03",
                  title: "Learn, code, and research",
                  desc: "Get authoritative answers with page citations, run sandboxed code, take adaptive quizzes, and draft literature reviews.",
                  icon: Sparkles,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.step} className="flex gap-4">
                    <div className="flex-shrink-0">
                      <span className="font-mono text-xs font-semibold text-muted-foreground/60">
                        {item.step}
                      </span>
                    </div>
                    <div>
                      <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                        <Icon className="size-4" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ — simple and scannable */}
        <section className="py-20 sm:py-24 border-t border-border/50 bg-muted/20">
          <div className="mx-auto max-w-3xl px-6 sm:px-10">
            <div className="mb-10 flex items-center gap-2">
              <HelpCircle className="size-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Common questions
              </h2>
            </div>

            <dl className="space-y-6">
              {faqs.map((faq) => (
                <div key={faq.q} className="border-b border-border/60 pb-6 last:border-0 last:pb-0">
                  <dt className="text-sm font-semibold text-foreground">{faq.q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CTA — simple, no gradient blob */}
        <section className="border-t border-border/50 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-6 sm:px-10 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Ready to transform your academic workflow?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              Join ISI Kef&apos;s AI-Vision platform and unlock intelligent tools for learning, research, and collaboration.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/sign-up"
                className={buttonVariants({
                  size: "lg",
                  className: "gap-2 px-7",
                })}
              >
                Create your account
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/dashboard"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "px-7",
                })}
              >
                Explore dashboard
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer — 3-column, clean */}
      <footer className="border-t border-border/50 py-12">
        <div className="mx-auto max-w-5xl px-6 sm:px-10">
          <div className="grid gap-8 sm:grid-cols-3">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Eye className="size-4" />
                </div>
                <span className="font-semibold text-foreground">UniMind AI</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium text-muted-foreground">
                  ISI Kef
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Intelligent academic platform for Institut Supérieur d&apos;Informatique du Kef. Engineered by{" "}
                <span className="font-medium text-foreground">#AB-MAHDI</span>.
              </p>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                All Systems Operational
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Platform</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link></li>
                <li><Link href="/workspace" className="hover:text-foreground transition-colors">AI Workspace</Link></li>
                <li><Link href="/coding" className="hover:text-foreground transition-colors">Coding Lab</Link></li>
                <li><Link href="/research" className="hover:text-foreground transition-colors">Research Studio</Link></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Academic</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><Link href="/courses" className="hover:text-foreground transition-colors">Course Workspaces</Link></li>
                <li><Link href="/learning" className="hover:text-foreground transition-colors">Study Plans & Quizzes</Link></li>
                <li><Link href="/admin" className="hover:text-foreground transition-colors">Administration</Link></li>
                <li><Link href="/sign-up" className="hover:text-foreground transition-colors">Create account</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>© {year} UniMind AI · ISI Kef · Developed by <span className="font-medium text-foreground">#AB-MAHDI</span></p>
            <div className="flex items-center gap-4">
              <Link href="/sign-in" className="hover:text-foreground transition-colors">Sign in</Link>
              <Link href="/sign-up" className="hover:text-foreground transition-colors">Register</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
