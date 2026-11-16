"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { apiRequest } from "@/lib/api";

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
        setError(err instanceof Error ? err.message : "Unexpected API error"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-xl rounded-xl border bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold">
          UniMind AI — API Connection
        </h1>

        {loading && <p>Connecting to FastAPI...</p>}
        {result && (
          <p className="text-green-700" role="status">
            {result.message}
          </p>
        )}
        {error && (
          <p className="text-red-700" role="alert">
            Connection failed: {error}
          </p>
        )}
      </div>
    </main>
  );
}
