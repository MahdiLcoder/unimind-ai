import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function ResearchLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
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
        <div className="border-b pb-6">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-2 h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>

        <div className="mt-8 flex gap-3">
          <Skeleton className="h-11 flex-1 rounded-md" />
          <Skeleton className="h-11 w-36 rounded-md" />
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-9 w-44 rounded-md" />
          </div>

          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-5">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-16 w-5/6 mt-2" />
                  </div>
                  <Skeleton className="h-8 w-20 rounded-md ml-4" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
