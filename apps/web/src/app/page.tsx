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
  Cpu,
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

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b bg-gradient-to-b from-muted/30 via-background to-background py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-6 sm:px-10">
            <div className="flex flex-col items-start max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <Cpu className="size-3.5" />
                UniMind AI
              </div>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-6xl sm:leading-[1.1]">
                Your university, made easier to navigate.
              </h1>

              <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
                A connected workspace for university knowledge, learning, research, and
                academic planning powered by specialized multi-agent systems.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className={buttonVariants({ size: "lg", className: "gap-2" })}
                >
                  Open dashboard
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/sign-in"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className={buttonVariants({ variant: "secondary", size: "lg" })}
                >
                  Create account
                </Link>
              </div>

              {/* Trust & Quality Indicators */}
              <div className="mt-12 flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span>FERPA-conscious sandboxing</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span>Ground truth citation verification</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span>Role-based academic governance</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid Section */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-6 sm:px-10">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Platform Architecture
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  Intelligent academic capabilities
                </h2>
              </div>
              <p className="max-w-md text-sm text-muted-foreground">
                Every tool is engineered with accessibility, keyboard ergonomics, and responsive layout stability.
              </p>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card
                    key={feature.title}
                    className="group relative flex flex-col justify-between transition-all duration-200 hover:border-primary/50 hover:shadow-md"
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <Icon className="size-5" />
                        </div>
                        <Badge variant="outline" className="text-xs font-normal">
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
                    <CardContent className="pt-0">
                      <Link
                        href={feature.href}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      >
                        Explore capability
                        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/20 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row sm:px-10">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} UniMind AI. Built for modern university workflows.
          </p>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/workspace" className="hover:text-foreground">
              Workspace
            </Link>
            <Link href="/courses" className="hover:text-foreground">
              Courses
            </Link>
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
