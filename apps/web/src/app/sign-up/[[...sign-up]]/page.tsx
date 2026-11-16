import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { SiteHeader, SiteHeaderFallback } from "@/components/site-header";

function AuthSkeleton() {
  return (
    <Card className="w-full max-w-md p-8 shadow-sm border-border/60">
      <div className="flex flex-col items-center space-y-3">
        <Skeleton className="size-10 rounded-xl" />
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="mt-8 space-y-4">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md mt-6" />
      </div>
    </Card>
  );
}

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 h-[450px] w-[650px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <Suspense fallback={<SiteHeaderFallback />}>
        <SiteHeader />
      </Suspense>
      <main className="relative flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <Suspense fallback={<AuthSkeleton />}>
          <SignUp path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/dashboard" />
        </Suspense>
      </main>
    </div>
  );
}
