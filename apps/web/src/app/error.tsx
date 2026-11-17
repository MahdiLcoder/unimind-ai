"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Route segment failed to render", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page could not be loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Try loading the page again.
        </p>
        <Button className="mt-5" onClick={retry} type="button">
          Try again
        </Button>
      </section>
    </main>
  );
}
