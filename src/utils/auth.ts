const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Returns a UUID-safe user id (or null) from any arbitrary input.
 * We accept ONLY UUIDs because your DB has FK to users(id uuid).
 */
export function getSafeUserId(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  return isUuid(v) ? v : null;
}
