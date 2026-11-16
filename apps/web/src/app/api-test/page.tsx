"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { CheckCircle2, AlertCircle, RefreshCw, Cpu } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const connectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

type ConnectionResponse = z.infer<typeof connectionResponseSchema>;

export default function ApiTestPage() {
  const [result, setResult] = useState<ConnectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest("/api/v1/test", connectionResponseSchema)
      .then(setResult)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Unexpected API error")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center p-6 sm:p-8">
        <Card className="w-full max-w-lg shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Cpu className="size-5" />
              </div>
              <Badge variant="outline">Backend Diagnostics</Badge>
            </div>
            <CardTitle className="mt-3 text-xl font-semibold">
              UniMind AI — API Connection
            </CardTitle>
            <CardDescription className="text-xs">
              Live status probe to the backend FastAPI services.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/40 text-sm text-muted-foreground" role="status">
                <RefreshCw className="size-4 animate-spin text-primary" />
                <span>Connecting to FastAPI...</span>
              </div>
            )}
            {result && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-sm text-emerald-800 dark:text-emerald-300" role="status">
                <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Backend Operational</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{result.message}</p>
                </div>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive" role="alert">
                <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Connection failed</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
