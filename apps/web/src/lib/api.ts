import { z } from "zod";

export type ApiRequestOptions = RequestInit & {
  accessToken?: string;
  /** Abort the request if the server takes too long to respond. */
  timeoutMs?: number;
};

export async function apiFetch(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  const {
    accessToken,
    headers: requestHeaders,
    timeoutMs,
    signal,
    ...requestOptions
  } = options;
  const headers = new Headers(requestHeaders);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const requestSignal =
    timeoutMs === undefined
      ? signal
      : signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);

  try {
    return await fetch(new URL(endpoint, apiUrl), {
      ...requestOptions,
      headers,
      ...(requestSignal ? { signal: requestSignal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") {
      throw new Error("The server took too long to respond. Please try again.");
    }
    throw cause;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
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
