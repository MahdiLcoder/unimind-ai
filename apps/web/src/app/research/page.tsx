import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import ResearchContent from "./research-content";

export default async function ResearchPage() {
  await auth.protect();

  return (
    <Suspense fallback={<p className="p-8" role="status">Loading research studio…</p>}>
      <ResearchContent />
    </Suspense>
  );
}
