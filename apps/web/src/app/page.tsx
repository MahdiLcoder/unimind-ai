export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20 sm:px-10">
      <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-700">
        UniMind AI
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
        Your university, made easier to navigate.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
        A dependable foundation for a university assistant: connect to the API,
        verify infrastructure, and build from there.
      </p>
      <a
        className="mt-9 inline-flex w-fit items-center rounded-lg bg-indigo-700 px-5 py-3 font-medium text-white transition-colors hover:bg-indigo-800"
        href="/api-test"
      >
        Check the API connection
      </a>
    </main>
  );
}
