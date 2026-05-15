import { ApiError } from "./api-client";

// Classify any thrown value into an error code the UI can act on.
// - ApiError → use its structured code
// - fetch network failure (TypeError) → network_error
// - everything else → unknown_error
export function classifyError(err: unknown): string {
  if (err instanceof ApiError) return err.code;
  if (err instanceof TypeError) return "network_error";
  return "unknown_error";
}

// Same classification for errors from our own Next.js route handlers,
// which return { error: { code } } JSON bodies.
export function classifyRouteError(data: { error?: { code?: string } } | null): string {
  return data?.error?.code ?? "unknown_error";
}
