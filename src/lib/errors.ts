/**
 * Node's fetch (undici) wraps the real TLS/DNS/connection failure in
 * `error.cause` and leaves `error.message` as a generic "fetch failed" —
 * without surfacing the cause, users only see that unhelpful message and
 * have no way to diagnose e.g. an untrusted local dev certificate.
 */
export function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = (error as Error & { cause?: unknown }).cause;

  if (cause instanceof Error) {
    return `${error.message} — ${cause.message}`;
  }

  return error.message;
}
