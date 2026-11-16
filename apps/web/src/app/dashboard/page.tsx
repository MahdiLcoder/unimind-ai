import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import DashboardContent from "./dashboard-content";

export default async function DashboardPage() {
  await auth.protect();

  return (
    <Suspense fallback={<p className="p-8" role="status">Loading dashboard…</p>}>
      <DashboardContent />
    </Suspense>
  );
}
