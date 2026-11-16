import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";

function AuthSkeleton() {
  return (
    <Card className="w-full max-w-md p-8 shadow-sm">
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
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <Suspense fallback={<AuthSkeleton />}>
          <SignUp path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/dashboard" />
        </Suspense>
      </main>
    </div>
  );
}
