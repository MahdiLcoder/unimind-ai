import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header skeleton */}
      <div className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="size-8 rounded-full" />
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-10">
        {/* Page title */}
        <div className="flex items-center justify-between border-b pb-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-44" />
          </div>
          <Skeleton className="size-9 rounded-full" />
        </div>

        {/* Profile Card Skeleton */}
        <Card className="mt-8">
          <CardHeader className="pb-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-48 mt-1" />
            <Skeleton className="h-4 w-32 mt-1" />
          </CardHeader>
        </Card>

        {/* 5 Stats Cards Skeleton */}
        <div className="mt-8 space-y-4">
          <Skeleton className="h-6 w-52" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-2 h-8 w-14" />
              </Card>
            ))}
          </div>
        </div>

        {/* Two-column tasks and notifications */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/2" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="mt-2 h-4 w-5/6" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Hub cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-1 h-4 w-3/4" />
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
