import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import CodingContent from "./coding-content";

export default async function CodingPage() {
  await auth.protect();

  return (
    <Suspense fallback={<p className="p-8" role="status">Loading coding lab…</p>}>
      <CodingContent />
    </Suspense>
  );
}
