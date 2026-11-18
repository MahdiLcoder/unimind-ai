import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function CodingLoading() {
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
          <Skeleton className="mt-2 h-8 w-44" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>

        <Skeleton className="mt-6 h-14 w-full rounded-xl" />

        <Card className="mt-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="sm:col-span-2">
              <Skeleton className="h-4 w-44 mb-2" />
              <Skeleton className="h-28 w-full rounded-md" />
            </div>
            <div className="sm:col-span-2">
              <Skeleton className="h-4 w-52 mb-2" />
              <Skeleton className="h-48 w-full rounded-md" />
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <Skeleton className="h-10 w-44 rounded-md" />
              <Skeleton className="h-10 w-36 rounded-md" />
              <Skeleton className="h-10 w-36 rounded-md" />
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
