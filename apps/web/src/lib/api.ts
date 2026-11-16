import { z } from "zod";

export async function apiFetch(
  endpoint: string,
  options: RequestInit & { accessToken?: string } = {},
): Promise<Response> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  const { accessToken, headers: requestHeaders, ...requestOptions } = options;
  const headers = new Headers(requestHeaders);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return fetch(new URL(endpoint, apiUrl), { ...requestOptions, headers });
}

export async function apiRequest<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  options: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const response = await apiFetch(endpoint, options);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail =
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
        ? body.detail
        : `API request failed: ${response.status}`;
    throw new Error(detail);
  }

  return schema.parse(await response.json());
}
