import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import WorkspaceContent from "./workspace-content";

export default async function WorkspacePage() {
  await auth.protect();

  return (
    <Suspense fallback={<p className="p-8" role="status">Loading workspace…</p>}>
      <WorkspaceContent />
    </Suspense>
  );
}
