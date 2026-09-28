export function classifySignupResult(input: { session: unknown; user: { identities?: unknown[] | null } | null }): "session" | "existing" | "confirm" {
  if (input.session) return "session";
  if (input.user && Array.isArray(input.user.identities) && input.user.identities.length === 0) return "existing";
  return "confirm";
}
