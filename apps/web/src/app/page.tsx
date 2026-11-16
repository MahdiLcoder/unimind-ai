"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  FolderKanban,
  BookOpen,
  Sparkles,
  Code2,
  FileSearch,
  Shield,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Eye,
  Brain,
  Zap,
  Terminal,
  GraduationCap,
  Users,
  FileText,
  HelpCircle,
  Search,
  Check,
  ChevronRight,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SiteHeader } from "@/components/site-header";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" },
  }),
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const features = [
  {
    title: "AI Workspace & Document RAG",
    description:
      "Upload course syllabi, lecture notes, and assignments. Chat with a grounded multi-agent assistant with verified citations.",
    icon: FolderKanban,
    href: "/workspace",
    badge: "Core RAG",
    gradient: "from-violet-500/10 to-indigo-500/10",
  },
  {
    title: "Course Workspaces",
    description:
      "Manage academic workspaces, enrollments, student rosters, and distributed assignments in one unified interface.",
    icon: BookOpen,
    href: "/courses",
    badge: "Academic",
    gradient: "from-blue-500/10 to-cyan-500/10",
  },
  {
    title: "Learning Studio & Quizzes",
    description:
      "Generate custom study plans, track assignments, and take interactive auto-graded quizzes with instant feedback.",
    icon: Sparkles,
    href: "/learning",
    badge: "Study AI",
    gradient: "from-amber-500/10 to-orange-500/10",
  },
  {
    title: "Coding Lab & Execution",
    description:
      "Interactive code editor with sandboxed execution, code generation, AI review, and automated programming tutoring.",
    icon: Code2,
    href: "/coding",
    badge: "Sandbox",
    gradient: "from-emerald-500/10 to-teal-500/10",
  },
  {
    title: "Research Studio",
    description:
      "Search academic literature via Crossref, auto-generate APA citations, and synthesize comprehensive literature reviews.",
    icon: FileSearch,
    href: "/research",
    badge: "Literature",
    gradient: "from-rose-500/10 to-pink-500/10",
  },
  {
    title: "Enterprise Administration",
    description:
      "Role-based access control, security audit logging, feature flag management, and workspace governance.",
    icon: Shield,
    href: "/admin",
    badge: "Governance",
    gradient: "from-slate-500/10 to-gray-500/10",
  },
];

const stats = [
  { value: "6", label: "AI-Powered Modules" },
  { value: "∞", label: "Documents Supported" },
  { value: "24/7", label: "AI Availability" },
  { value: "100%", label: "Citation Verified" },
];

export default function Home() {
  const [year, setYear] = useState(2026);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border/50 py-24 sm:py-36">
          {/* Ambient background glow */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute top-20 right-1/4 h-[300px] w-[400px] rounded-full bg-primary/3 blur-3xl" />
          </div>
          {/* Grid pattern overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />

          <div className="relative mx-auto max-w-6xl px-6 sm:px-10">
            <motion.div
              className="flex flex-col items-center text-center max-w-4xl mx-auto"
              initial="hidden"
              animate="visible"
              variants={stagger}
            >
              <motion.div variants={fadeUp} custom={0}>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary backdrop-blur-sm">
                  <Eye className="size-3.5" />
                  ISI Kef · AI-Vision · by #AB-Mahdi
                </div>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                custom={1}
                className="mt-8 text-5xl font-bold tracking-tight text-foreground sm:text-7xl sm:leading-[1.05]"
              >
                Where{" "}
                <span className="text-gradient-primary">artificial intelligence</span>{" "}
                meets academic{" "}
                <span className="text-gradient-primary">vision</span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                custom={2}
                className="mt-7 text-lg leading-8 text-muted-foreground sm:text-xl max-w-2xl"
              >
                A connected university platform crafted for ISI Kef (Institut Supérieur d&apos;Informatique du Kef) — empowering student learning, research synthesis, and multi-agent AI collaboration.
              </motion.p>

              <motion.div
                variants={fadeUp}
                custom={3}
                className="mt-10 flex flex-wrap items-center justify-center gap-3"
              >
                <Link
                  href="/dashboard"
                  className={buttonVariants({
                    size: "lg",
                    className: "gap-2 glow-primary shadow-lg px-8",
                  })}
                >
                  Open dashboard
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/sign-in"
                  className={buttonVariants({ variant: "outline", size: "lg", className: "px-8" })}
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className={buttonVariants({
                    variant: "secondary",
                    size: "lg",
                    className: "px-8",
                  })}
                >
                  Create account
                </Link>
              </motion.div>

              {/* Trust & Quality Indicators */}
              <motion.div
                variants={fadeUp}
                custom={4}
                className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted-foreground"
              >
                {[
                  "FERPA-conscious sandboxing",
                  "Ground truth citation verification",
                  "Role-based academic governance",
                ].map((text) => (
                  <div key={text} className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    <span>{text}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="border-b border-border/50 bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 sm:px-10">
            <motion.div
              className="grid grid-cols-2 gap-px sm:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
            >
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  variants={fadeUp}
                  custom={i}
                  className="flex flex-col items-center py-8 sm:py-10"
                >
                  <span className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {stat.value}
                  </span>
                  <span className="mt-1.5 text-xs font-medium text-muted-foreground tracking-wide uppercase">
                    {stat.label}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Feature Grid Section */}
        <section className="py-24 sm:py-32">
          <div className="mx-auto max-w-6xl px-6 sm:px-10">
            <motion.div
              className="flex flex-col items-center text-center"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
            >
              <motion.div variants={fadeUp} custom={0}>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Brain className="size-3.5" />
                  Platform Architecture
                </div>
              </motion.div>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="mt-5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              >
                Intelligent academic capabilities
              </motion.h2>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="mt-4 max-w-xl text-base text-muted-foreground"
              >
                Every tool is engineered with accessibility, keyboard ergonomics,
                and responsive layout stability.
              </motion.p>
            </motion.div>

            <motion.div
              className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={stagger}
            >
              {features.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <motion.div key={feature.title} variants={fadeUp} custom={i}>
                    <Card className="group relative flex h-full flex-col justify-between overflow-hidden border-border/60 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                      {/* Gradient highlight on hover */}
                      <div
                        className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                      />
                      <CardHeader className="relative">
                        <div className="flex items-center justify-between">
                          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-lg group-hover:shadow-primary/20">
                            <Icon className="size-5" />
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[11px] font-medium border-border/60"
                          >
                            {feature.badge}
                          </Badge>
                        </div>
                        <CardTitle className="mt-4 text-lg font-semibold group-hover:text-primary transition-colors">
                          {feature.title}
                        </CardTitle>
                        <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                          {feature.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="relative pt-0">
                        <Link
                          href={feature.href}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        >
                          Explore capability
                          <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-1" />
                        </Link>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* Interactive Platform Showcase Section */}
        <section className="border-t border-border/50 bg-muted/20 py-24 sm:py-32">
          <div className="mx-auto max-w-6xl px-6 sm:px-10">
            <motion.div
              className="flex flex-col items-center text-center max-w-2xl mx-auto"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
            >
              <motion.div variants={fadeUp} custom={0}>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Eye className="size-3.5" />
                  Live Platform Preview
                </div>
              </motion.div>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              >
                Experience the university AI interface
              </motion.h2>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="mt-3 text-base text-muted-foreground"
              >
                Explore how students, researchers, and instructors interact with grounded agents
                in every academic domain.
              </motion.p>
            </motion.div>

            {/* Showcase Tabs */}
            <div className="mt-12">
              <Tabs defaultValue="rag" className="w-full">
                <div className="flex justify-center mb-8">
                  <TabsList className="h-11 p-1 bg-muted/60 border border-border/60">
                    <TabsTrigger value="rag" className="gap-2 text-xs sm:text-sm">
                      <FolderKanban className="size-4" />
                      Document RAG
                    </TabsTrigger>
                    <TabsTrigger value="coding" className="gap-2 text-xs sm:text-sm">
                      <Code2 className="size-4" />
                      Coding Sandbox
                    </TabsTrigger>
                    <TabsTrigger value="study" className="gap-2 text-xs sm:text-sm">
                      <Sparkles className="size-4" />
                      Adaptive Study
                    </TabsTrigger>
                    <TabsTrigger value="research" className="gap-2 text-xs sm:text-sm">
                      <FileSearch className="size-4" />
                      Research Studio
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Tab 1: Document RAG */}
                <TabsContent value="rag">
                  <Card className="overflow-hidden border-border/70 shadow-lg">
                    <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full bg-destructive/60" />
                        <div className="size-3 rounded-full bg-amber-500/60" />
                        <div className="size-3 rounded-full bg-emerald-500/60" />
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          ai-workspace / cs402-deep-learning
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[11px] gap-1 font-mono">
                        <CheckCircle2 className="size-3 text-emerald-500" />
                        Vector Grounded
                      </Badge>
                    </div>
                    <div className="grid gap-6 p-6 lg:grid-cols-3">
                      <div className="lg:col-span-2 space-y-4">
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Student Question</p>
                          <p className="mt-1 text-sm text-foreground">
                            What is the late submission policy and how do slip days work for assignment 3?
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                              UniMind Assistant
                            </Badge>
                            <span className="text-xs text-muted-foreground">Synthesized with 2 verified citations</span>
                          </div>
                          <p className="text-sm leading-relaxed text-foreground">
                            According to the course syllabus, here is the official policy:
                          </p>
                          <ul className="list-disc pl-5 text-xs space-y-1.5 text-muted-foreground">
                            <li><strong className="text-foreground">Slip Days:</strong> Each student is allocated 3 free slip days across the entire semester to use on any homework or programming assignment without penalty.</li>
                            <li><strong className="text-foreground">Late Penalties:</strong> Once slip days are exhausted, late submissions incur a 10% penalty per 24 hours.</li>
                            <li><strong className="text-foreground">Maximum Window:</strong> Submissions are not accepted more than 72 hours past the deadline.</li>
                          </ul>
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                            <Badge variant="secondary" className="text-[10px] gap-1 bg-muted/80">
                              <FileText className="size-3 text-primary" />
                              CS402_Syllabus.pdf (p. 4, §3.2) · 98% match
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] gap-1 bg-muted/80">
                              <FileText className="size-3 text-primary" />
                              Assignment3_Brief.pdf (p. 1)
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Indexed Course Documents</p>
                        <div className="space-y-2">
                          {[
                            { name: "CS402_Syllabus.pdf", size: "245 KB", chunks: "32 chunks" },
                            { name: "Lecture04_Optimization.pdf", size: "1.8 MB", chunks: "84 chunks" },
                            { name: "Assignment3_Brief.pdf", size: "120 KB", chunks: "14 chunks" },
                          ].map((doc) => (
                            <div key={doc.name} className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="size-3.5 text-primary shrink-0" />
                                <span className="truncate font-medium">{doc.name}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">{doc.chunks}</span>
                            </div>
                          ))}
                        </div>
                        <Link
                          href="/workspace"
                          className={buttonVariants({ variant: "outline", size: "sm", className: "w-full text-xs mt-3" })}
                        >
                          Open AI Workspace
                          <ArrowRight className="size-3 ml-1" />
                        </Link>
                      </div>
                    </div>
                  </Card>
                </TabsContent>

                {/* Tab 2: Coding Sandbox */}
                <TabsContent value="coding">
                  <Card className="overflow-hidden border-border/70 shadow-lg font-mono">
                    <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Terminal className="size-4 text-primary" />
                        <span className="text-xs text-foreground font-semibold">coding-lab / dijkstra_optimizer.py</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">Python 3.12</Badge>
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                          Sandboxed
                        </Badge>
                      </div>
                    </div>
                    <div className="grid gap-4 p-5 lg:grid-cols-2">
                      <div className="rounded-xl border bg-zinc-950 p-4 text-xs text-zinc-100 space-y-1 overflow-x-auto">
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
                        <div className="rounded-xl border bg-muted/40 p-4 font-mono text-xs space-y-2">
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
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs font-sans space-y-1.5">
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
                </TabsContent>

                {/* Tab 3: Adaptive Study */}
                <TabsContent value="study">
                  <Card className="overflow-hidden border-border/70 shadow-lg">
                    <div className="grid gap-6 p-6 lg:grid-cols-2">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-semibold flex items-center gap-2">
                            <Sparkles className="size-4 text-primary" />
                            Personalized Study Schedule
                          </h3>
                          <Badge variant="secondary" className="text-[10px]">CS 402 Final Prep</Badge>
                        </div>
                        <div className="space-y-2.5">
                          {[
                            { day: "Day 1 (Mon)", topic: "Backpropagation & Gradient Clipping", time: "60 mins", status: "completed" },
                            { day: "Day 2 (Tue)", topic: "Transformer Self-Attention Mechanisms", time: "75 mins", status: "in_progress" },
                            { day: "Day 3 (Wed)", topic: "Vision Transformer (ViT) Patch Embeddings", time: "45 mins", status: "pending" },
                          ].map((item) => (
                            <div key={item.day} className="flex items-center justify-between rounded-xl border p-3 bg-card/60">
                              <div className="flex items-center gap-3">
                                {item.status === "completed" ? (
                                  <CheckCircle2 className="size-4 text-emerald-500" />
                                ) : item.status === "in_progress" ? (
                                  <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                ) : (
                                  <div className="size-4 rounded-full border-2 border-muted-foreground/30" />
                                )}
                                <div>
                                  <p className="text-xs font-semibold text-foreground">{item.topic}</p>
                                  <p className="text-[11px] text-muted-foreground">{item.day} · {item.time}</p>
                                </div>
                              </div>
                              <Badge variant={item.status === "completed" ? "outline" : "secondary"} className="text-[10px]">
                                {item.status === "completed" ? "Mastered" : item.status === "in_progress" ? "Active" : "Upcoming"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-semibold flex items-center gap-2">
                            <GraduationCap className="size-4 text-primary" />
                            Concept Mastery Quiz
                          </h3>
                          <span className="text-xs font-semibold text-primary">Score: 92% (11/12)</span>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3 text-xs">
                          <p className="font-medium text-foreground">
                            Q3: Why are positional encodings added to input embeddings in standard Transformers?
                          </p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-foreground">
                              <Check className="size-3.5 text-emerald-500 shrink-0" />
                              <span>Because self-attention is permutation-invariant and lacks inherent sequence order awareness.</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card p-2.5 text-muted-foreground opacity-60">
                              <span className="size-3.5 shrink-0 rounded-full border border-muted-foreground/40" />
                              <span>To normalize gradient vanishing during deep backpropagation across layers.</span>
                            </div>
                          </div>
                          <div className="rounded-lg bg-card p-2.5 border text-[11px] text-muted-foreground">
                            <strong className="text-foreground">AI Feedback:</strong> Correct! The sinusoidal or learned positional encodings supply spatial order to token embeddings.
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </TabsContent>

                {/* Tab 4: Research Studio */}
                <TabsContent value="research">
                  <Card className="overflow-hidden border-border/70 shadow-lg">
                    <div className="p-6 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
                        <div>
                          <h3 className="text-base font-semibold flex items-center gap-2">
                            <FileSearch className="size-4 text-primary" />
                            Literature Synthesis &amp; Citation Engine
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Live Crossref query: &quot;Attention mechanisms in medical imaging&quot;
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Search className="size-3 text-primary" />
                          Crossref Indexed
                        </Badge>
                      </div>
                      <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Synthesized Literature Overview
                        </p>
                        <p className="text-xs leading-relaxed text-foreground">
                          Recent literature demonstrates that vision transformers and multi-scale cross-attention models consistently outperform traditional CNNs in segmentation tasks when trained on multi-modal clinical imaging datasets, providing interpretable saliency heatmaps.
                        </p>
                        <div className="space-y-2 pt-2">
                          {[
                            {
                              title: "Attention U-Net: Learning Where to Look for the Pancreas",
                              authors: "Oktay, O., Schlemper, J., Folgoc, L. L., et al.",
                              year: "2018",
                              doi: "10.48550/arXiv.1804.03999",
                            },
                            {
                              title: "Transformers in Medical Imaging: A Survey",
                              authors: "Shamshad, F., Khan, S., Zamir, S. W., et al.",
                              year: "2023",
                              doi: "10.1016/j.media.2023.102802",
                            },
                          ].map((paper) => (
                            <div key={paper.title} className="rounded-lg border bg-card p-3 text-xs space-y-1">
                              <p className="font-medium text-foreground">{paper.title}</p>
                              <p className="text-[11px] text-muted-foreground">{paper.authors} ({paper.year})</p>
                              <p className="font-mono text-[10px] text-primary">https://doi.org/{paper.doi}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </section>

        {/* 3-Step Academic Workflow Section */}
        <section className="py-24 sm:py-32 border-b border-border/50">
          <div className="mx-auto max-w-6xl px-6 sm:px-10">
            <motion.div
              className="flex flex-col items-center text-center max-w-2xl mx-auto"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
            >
              <motion.div variants={fadeUp} custom={0}>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Zap className="size-3.5" />
                  Structured Process
                </div>
              </motion.div>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              >
                How UniMind powers university success
              </motion.h2>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="mt-3 text-base text-muted-foreground"
              >
                From document ingestion to grounded outputs in three seamless steps.
              </motion.p>
            </motion.div>

            <div className="mt-16 grid gap-8 md:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Connect & Ingest",
                  desc: "Upload syllabi, lecture slides, textbooks, and code repositories. Documents are chunked and privately indexed with semantic embeddings.",
                  icon: FolderKanban,
                },
                {
                  step: "02",
                  title: "Multi-Agent Grounding",
                  desc: "Specialized agents route your query: citation verifiers check ground truth, code tutors sandbox execution, and study planners align with course dates.",
                  icon: Brain,
                },
                {
                  step: "03",
                  title: "Learn, Code & Research",
                  desc: "Receive authoritative answers with page citations, execute safe code benchmarks, take adaptive quizzes, and draft literature reviews.",
                  icon: Sparkles,
                },
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <Card key={item.step} className="relative flex flex-col justify-between p-6 border-border/70 shadow-xs hover:border-primary/40 transition-colors">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-3xl font-bold tracking-tight text-primary/30 font-mono">
                          {item.step}
                        </span>
                        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon className="size-5" />
                        </div>
                      </div>
                      <h3 className="mt-6 text-lg font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-border/40 flex items-center text-xs font-medium text-primary">
                      <span>Explore stage {idx + 1}</span>
                      <ChevronRight className="size-3.5 ml-1" />
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Academic Role Personas */}
        <section className="py-24 sm:py-32 bg-muted/20 border-b border-border/50">
          <div className="mx-auto max-w-6xl px-6 sm:px-10">
            <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                <Users className="size-3.5" />
                Designed For Campus
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Tailored for every academic role
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Whether studying for midterms or managing department-wide research grants.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  role: "Students",
                  icon: GraduationCap,
                  desc: "Instant grounded answers from course slides, auto-generated flashcards, practice quizzes, and 24/7 coding help.",
                  badge: "Undergrad & Grad",
                },
                {
                  role: "Teaching Assistants",
                  icon: BookOpen,
                  desc: "Automated assignment grading rubrics, student query deflection, and course discussion assistance.",
                  badge: "Course Support",
                },
                {
                  role: "Professors & Faculty",
                  icon: Shield,
                  desc: "Private course workspaces, syllabus distribution, student progress tracking, and FERPA-conscious privacy.",
                  badge: "Instructors",
                },
                {
                  role: "Researchers",
                  icon: FileSearch,
                  desc: "Crossref bibliography queries, APA citation formatting, and multi-paper comparative literature reviews.",
                  badge: "Lab & Thesis",
                },
              ].map((persona) => {
                const Icon = persona.icon;
                return (
                  <Card key={persona.role} className="p-5 border-border/70 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon className="size-5" />
                        </div>
                        <Badge variant="outline" className="text-[10px]">{persona.badge}</Badge>
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">{persona.role}</h3>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{persona.desc}</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-24 sm:py-32 border-b border-border/50">
          <div className="mx-auto max-w-4xl px-6 sm:px-10">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                <HelpCircle className="size-3.5" />
                Common Questions
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-4">
              {[
                {
                  q: "How does UniMind AI prevent hallucinations in academic answers?",
                  a: "UniMind uses a strict Retrieval-Augmented Generation (RAG) architecture. Agents only answer using chunks retrieved from your private documents, and every response displays exact page and section citations with confidence scores.",
                },
                {
                  q: "Is student and research data private and FERPA-compliant?",
                  a: "Yes. All uploaded documents, chat conversations, and course materials are isolated within your account and workspace. No data is used to train public commercial foundation models.",
                },
                {
                  q: "Is code execution in the Coding Lab safe for students and professors?",
                  a: "Yes. Code is executed inside an isolated sandbox container with strict CPU, memory, and timeout limits (maximum 10 seconds), preventing system interference and infinite loops.",
                },
                {
                  q: "Can professors assign specific workspaces to their enrolled students?",
                  a: "Yes. Instructors can create course workspaces, enroll students via their university emails, and distribute assignments that link directly to course knowledge bases.",
                },
              ].map((faq) => (
                <Card key={faq.q} className="p-5 border-border/70 shadow-xs">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-primary shrink-0" />
                    {faq.q}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground pl-6">
                    {faq.a}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t border-border/50">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:px-10 sm:py-32">
            <motion.div
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 px-8 py-16 sm:px-16 text-center"
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <div className="pointer-events-none absolute -top-24 left-1/2 h-[300px] w-[500px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary mb-6">
                  <Zap className="size-3.5" />
                  Get Started Today
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Ready to transform your academic workflow?
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground">
                  Join your university&apos;s AI-Vision club platform and unlock intelligent
                  tools for learning, research, and collaboration.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/sign-up"
                    className={buttonVariants({
                      size: "lg",
                      className: "gap-2 glow-primary shadow-lg px-8",
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
                      className: "px-8",
                    })}
                  >
                    Explore dashboard
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/20 py-16">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Eye className="size-5" />
                </div>
                <div>
                  <span className="font-bold tracking-tight text-foreground text-base">UniMind AI</span>
                  <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                    ISI Kef
                  </Badge>
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                    AI-Vision Club · Engineered by <strong className="text-foreground">#AB-Mahdi</strong>
                  </p>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground max-w-sm">
                An intelligent university operating platform engineered for ISI Kef (Institut Supérieur d&apos;Informatique du Kef) by #AB-Mahdi, combining grounded document RAG, adaptive learning schedules, code sandbox execution, and literature synthesis.
              </p>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                All Systems Operational · FERPA Conscious
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Platform</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><Link href="/dashboard" className="hover:text-primary transition-colors">Overview Dashboard</Link></li>
                <li><Link href="/workspace" className="hover:text-primary transition-colors">AI Workspace &amp; RAG</Link></li>
                <li><Link href="/coding" className="hover:text-primary transition-colors">Coding Sandbox Lab</Link></li>
                <li><Link href="/research" className="hover:text-primary transition-colors">Research Studio</Link></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Academic</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><Link href="/courses" className="hover:text-primary transition-colors">Course Workspaces</Link></li>
                <li><Link href="/learning" className="hover:text-primary transition-colors">Adaptive Study Plans</Link></li>
                <li><Link href="/learning" className="hover:text-primary transition-colors">Practice Quizzes</Link></li>
                <li><Link href="/admin" className="hover:text-primary transition-colors">Department Admin</Link></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Governance</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><span className="text-muted-foreground/80">Role-Based Access (RBAC)</span></li>
                <li><span className="text-muted-foreground/80">Audited Execution Sandboxes</span></li>
                <li><span className="text-muted-foreground/80">Verified Crossref Citations</span></li>
                <li><span className="text-muted-foreground/80">Privacy &amp; Data Isolation</span></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>© {year} UniMind AI · ISI Kef (Institut Supérieur d&apos;Informatique du Kef) · Developed by <span className="font-semibold text-foreground">#AB-Mahdi</span></p>
            <div className="flex items-center gap-6">
              <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
              <Link href="/sign-in" className="hover:text-primary transition-colors">Sign in</Link>
              <Link href="/sign-up" className="hover:text-primary transition-colors">Register</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
