import { useCallback, useEffect, useState } from "react";
import { getStoredSupabaseUser, getSupabaseSession, subscribeAuthChange } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  /** Untrusted role hint from signup metadata; server authorization never trusts this field. */
  signupAccountTypeHint: string | null;
};

export type CurrentUserState = { user: AppUser | null; isPending: boolean; error: string | null; retry: () => void };

function normalize(user: ReturnType<typeof getStoredSupabaseUser>): AppUser | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.user_metadata?.name ?? user.user_metadata?.full_name ?? null,
    primaryEmail: user.email ?? null,
    profileImageUrl: user.user_metadata?.avatar_url ?? null,
    signupAccountTypeHint:
      typeof user.user_metadata?.account_type === "string" ? user.user_metadata.account_type : null,
  };
}

export function useCurrentUserState(): CurrentUserState {
  const [state, setState] = useState<{ user: AppUser | null; isPending: boolean; error: string | null }>({
    user: null,
    isPending: true,
    error: null,
  });
  const [retrySequence, setRetrySequence] = useState(0);
  const retry = useCallback(() => setRetrySequence((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    let authEventSequence = 0;
    const unsubscribe = subscribeAuthChange((_event, session) => {
      authEventSequence += 1;
      if (alive) setState({ user: normalize(session?.user ?? null), isPending: false, error: null });
    });
    const sequenceBeforeRestore = authEventSequence;
    void getSupabaseSession()
      .then((session) => {
        if (alive && authEventSequence === sequenceBeforeRestore) {
          setState({ user: normalize(session?.user ?? null), isPending: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (alive && authEventSequence === sequenceBeforeRestore) {
          console.warn("[auth] Session restoration unavailable", {
            message: error instanceof Error ? error.message : "Unknown session error",
          });
          setState({
            user: null,
            isPending: false,
            error: "Sign-in status could not be checked. Retry before opening your workspace.",
          });
        }
      });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [retrySequence]);

  return { ...state, retry };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
