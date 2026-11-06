import type { Session } from "@supabase/supabase-js";

type SessionResult = { data: { session: Session | null }; error: unknown };
type SessionAuth = {
  getSession: () => Promise<SessionResult>;
  refreshSession: () => Promise<SessionResult>;
};

/** Wait for the SDK's persisted/confirmation session before attempting refresh. */
export async function restoreSupabaseSession(
  auth: SessionAuth,
  opts: { forceRefresh?: boolean } = {},
): Promise<Session | null> {
  const restored = await auth.getSession();
  if (restored.error) throw restored.error;
  if (!restored.data.session) return null;
  if (!opts.forceRefresh) return restored.data.session;
  if (!restored.data.session.refresh_token) throw new Error("AUTH_REFRESH_TOKEN_MISSING");

  // Let the SDK read the latest persisted token; never pass a captured
  // refresh token that could have rotated in another tab or auto-refresh.
  const refreshed = await auth.refreshSession();
  if (refreshed.error) throw refreshed.error;
  if (!refreshed.data.session) throw new Error("AUTH_REFRESH_FAILED");
  return refreshed.data.session;
}
