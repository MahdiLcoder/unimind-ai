import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import AdminContent from "./admin-content";

export default async function AdminPage() {
  await auth.protect();

  return (
    <Suspense fallback={<p className="p-8" role="status">Loading administration…</p>}>
      <AdminContent />
    </Suspense>
  );
}
