import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import LearningContent from "./learning-content";

export default async function LearningPage() {
  await auth.protect();

  return (
    <Suspense fallback={<p className="p-8" role="status">Loading learning studio…</p>}>
      <LearningContent />
    </Suspense>
  );
}
