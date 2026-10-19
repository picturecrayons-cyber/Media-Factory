import type { Session } from "@supabase/supabase-js";

type SessionResult = { data: { session: Session | null }; error: unknown };
type SessionAuth = {
  getSession: () => Promise<SessionResult>;
  refreshSession: () => Promise<SessionResult>;
  signOut?: (options: { scope: "local" }) => Promise<unknown>;
};

function isDefinitelyInvalidRefreshToken(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = candidate.status;
  const details = [candidate.code, candidate.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  // Only clear local auth state for an explicit refresh-token rejection.
  // Generic 400s, fetch failures, and service errors must not sign users out.
  return (status === 400 || status === 401) &&
    /invalid refresh token|refresh token (?:not found|already used|expired)|refresh_token_(?:not_found|already_used)|invalid_grant/i.test(details);
}

/** Wait for the SDK's persisted/confirmation session before attempting refresh. */
export async function restoreSupabaseSession(
  auth: SessionAuth,
  opts: { forceRefresh?: boolean } = {},
): Promise<Session | null> {
  const restored = await auth.getSession();
  if (restored.error || !restored.data.session) return null;
  if (!opts.forceRefresh) return restored.data.session;
  if (!restored.data.session.refresh_token) return null;

  // Let the SDK read the latest persisted token; never pass a captured
  // refresh token that could have rotated in another tab or auto-refresh.
  const refreshed = await auth.refreshSession();
  if (refreshed.error) {
    if (isDefinitelyInvalidRefreshToken(refreshed.error)) {
      // Local-only cleanup: don't make a remote request while recovering from
      // an invalid token, and never fall back to a stale authenticated session.
      if (auth.signOut) {
        await auth.signOut({ scope: "local" }).catch(() => undefined);
      }
    }
    return null;
  }
  return refreshed.data.session;
}
