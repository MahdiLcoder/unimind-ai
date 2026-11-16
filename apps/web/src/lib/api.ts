import { z } from "zod";

export async function apiRequest<T>(
  endpoint: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  const response = await fetch(new URL(endpoint, apiUrl));
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return schema.parse(await response.json());
}
