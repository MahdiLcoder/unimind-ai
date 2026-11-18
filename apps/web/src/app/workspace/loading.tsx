import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function WorkspaceLoading() {
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
        <div className="mb-8 flex items-center justify-between border-b pb-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="size-9 rounded-full" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
          <Card className="flex min-h-[36rem] flex-col">
            <CardHeader className="border-b pb-4">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-4 w-80 mt-1" />
            </CardHeader>
            <CardContent className="flex-1 p-5 space-y-4">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-20 w-3/4 rounded-xl ml-auto" />
              <Skeleton className="h-24 w-5/6 rounded-xl" />
            </CardContent>
            <div className="border-t p-4 flex gap-2">
              <Skeleton className="h-10 flex-1 rounded-lg" />
              <Skeleton className="h-10 w-20 rounded-lg" />
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-5">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-full mt-1" />
              <Skeleton className="h-9 w-full rounded-lg mt-4" />
              <div className="mt-5 space-y-2">
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            </Card>

            <Card className="p-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-9 w-full rounded-lg mt-3" />
              <Skeleton className="h-9 w-full rounded-lg mt-2" />
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
