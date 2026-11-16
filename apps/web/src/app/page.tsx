import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-20 sm:px-10">
      <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
        UniMind AI
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
        Your university, made easier to navigate.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
        A connected workspace for university knowledge, learning, research, and
        academic planning.
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <Link
          className="inline-flex h-10 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          href="/dashboard"
        >
          Open dashboard
        </Link>
        <Link
          className="inline-flex h-10 items-center rounded-lg border px-5 font-medium transition-colors hover:bg-muted"
          href="/sign-in"
        >
          Sign in
        </Link>
        <Link
          className="inline-flex h-10 items-center rounded-lg border px-5 font-medium transition-colors hover:bg-muted"
          href="/sign-up"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
