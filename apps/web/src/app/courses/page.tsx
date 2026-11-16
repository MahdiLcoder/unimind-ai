import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import CoursesContent from "./courses-content";

export default async function CoursesPage() {
  await auth.protect();

  return (
    <Suspense fallback={<p className="p-8" role="status">Loading courses…</p>}>
      <CoursesContent />
    </Suspense>
  );
}
