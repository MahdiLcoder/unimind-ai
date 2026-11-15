"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

interface ConnectionResponse {
  success: boolean;
  message: string;
}

export default function ApiTestPage() {
  const [result, setResult] = useState<ConnectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<ConnectionResponse>("/api/v1/test")
      .then(setResult)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-xl rounded-xl border p-8">
        <h1 className="mb-4 text-2xl font-bold">
          UniMind AI — API Connection
        </h1>

        {loading && <p>Connecting to FastAPI...</p>}

        {result && (
          <p className="text-green-600">
            ✓ {result.message}
          </p>
        )}

        {error && (
          <p className="text-red-600">
            Connection failed: {error}
          </p>
        )}
      </div>
    </main>
  );
}