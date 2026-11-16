# UniMind AI web app

This Next.js 16 App Router workspace uses TypeScript, Tailwind CSS 4, and
shadcn/ui. For prerequisites, environment setup, and full-stack commands, see
the [repository development guide](../../README.md).

Run the app from the repository root with `pnpm dev`; this loads the root `.env`
and starts the frontend on <http://localhost:3000>. Set
`NEXT_PUBLIC_API_URL` to an API origin reachable from the browser. The
`/api-test` page verifies the configured FastAPI connection.

Run `pnpm --filter web lint`, `pnpm --filter web typecheck`, and
`pnpm --filter web build` from the repository root to validate this workspace.
