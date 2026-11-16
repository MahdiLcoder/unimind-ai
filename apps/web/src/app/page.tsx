"use client";

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
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary backdrop-blur-sm">
                  <Eye className="size-3.5" />
                  AI-Vision Club · University Platform
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
                A connected workspace for university knowledge, learning, research, and
                academic planning — powered by specialized multi-agent systems.
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
      <footer className="border-t border-border/50 bg-muted/20 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 sm:flex-row sm:px-10">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Cpu className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">UniMind AI</p>
              <p className="text-xs text-muted-foreground">
                © {new Date().getFullYear()} Built for modern university workflows.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-8 text-xs text-muted-foreground">
            <Link href="/dashboard" className="hover:text-primary transition-colors">
              Dashboard
            </Link>
            <Link href="/workspace" className="hover:text-primary transition-colors">
              Workspace
            </Link>
            <Link href="/courses" className="hover:text-primary transition-colors">
              Courses
            </Link>
            <Link href="/admin" className="hover:text-primary transition-colors">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
