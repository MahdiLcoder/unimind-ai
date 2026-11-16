import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiFetch, apiRequest } from "./api";

describe("Frontend API client (apiFetch and apiRequest)", () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalEnv;
  });

  it("throws an error if NEXT_PUBLIC_API_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    await expect(apiFetch("/api/v1/health")).rejects.toThrow(
      "NEXT_PUBLIC_API_URL is not configured",
    );
  });

  it("attaches the Bearer authorization header when accessToken is provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", mockFetch);

    await apiFetch("/api/v1/me", { accessToken: "test-jwt-token" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl.toString()).toBe("http://localhost:8000/api/v1/me");
    expect((calledInit.headers as Headers).get("Authorization")).toBe("Bearer test-jwt-token");
  });

  it("preserves custom request headers alongside auth", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", mockFetch);

    await apiFetch("/api/v1/query", {
      accessToken: "test-token",
      headers: { "X-Custom-Client": "unimind-test" },
    });

    const headers = mockFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(headers.get("X-Custom-Client")).toBe("unimind-test");
  });

  it("apiRequest parses valid payload using the provided Zod schema", async () => {
    const payload = { id: "123", name: "CS101", credits: 4 };
    const schema = z.object({
      id: z.string(),
      name: z.string(),
      credits: z.number(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await apiRequest("/api/v1/courses/123", schema);
    expect(result).toEqual(payload);
  });

  it("apiRequest extracts API error detail on 4xx/5xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Role elevation requires admin privilege" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const schema = z.object({ ok: z.boolean() });
    await expect(apiRequest("/api/v1/roles", schema)).rejects.toThrow(
      "Role elevation requires admin privilege",
    );
  });

  it("apiRequest provides fallback message when error response body is non-JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Internal Server Error", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    const schema = z.object({ ok: z.boolean() });
    await expect(apiRequest("/api/v1/roles", schema)).rejects.toThrow(
      "API request failed: 500",
    );
  });
});
