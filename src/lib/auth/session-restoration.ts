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
  if (restored.error || !restored.data.session) return null;
  if (!opts.forceRefresh) return restored.data.session;
  if (!restored.data.session.refresh_token) return null;

  // Let the SDK read the latest persisted token; never pass a captured
  // refresh token that could have rotated in another tab or auto-refresh.
  const refreshed = await auth.refreshSession();
  if (refreshed.error) return null;
  return refreshed.data.session;
}
