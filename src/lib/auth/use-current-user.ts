import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { getSupabaseSession, subscribeAuthChange } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  /** Untrusted role hint from signup metadata; server authorization never trusts this field. */
  signupAccountTypeHint: string | null;
};

export type CurrentUserState = {
  user: AppUser | null;
  isPending: boolean;
  authError: string | null;
  retry: () => void;
};

function normalize(user: User | null | undefined): AppUser | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: (user as any).user_metadata?.name ?? (user as any).user_metadata?.full_name ?? null,
    primaryEmail: (user as any).email ?? null,
    profileImageUrl: (user as any).user_metadata?.avatar_url ?? null,
    signupAccountTypeHint:
      typeof (user as any).user_metadata?.account_type === "string" ? (user as any).user_metadata.account_type : null,
  };
}

export function useCurrentUserState(): CurrentUserState {
  const [state, setState] = useState<Omit<CurrentUserState, "retry">>({
    user: null,
    isPending: true,
    authError: null,
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    let authChanged = false;
    setState({ user: null, isPending: true, authError: null });
    const unsubscribe = subscribeAuthChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        // INITIAL_SESSION is not sufficient to unlock protected data queries;
        // wait for the awaited getSession() result below.
        if (alive) setState({ user: normalize(session?.user), isPending: true, authError: null });
        return;
      }
      authChanged = true;
      if (alive) {
        setState({ user: normalize(session?.user), isPending: false, authError: null });
      }
    });

    void getSupabaseSession()
      .then((session) => {
        // A newer confirmation/refresh/sign-out/account-switch event wins.
        if (alive && !authChanged) {
          setState({ user: normalize(session?.user), isPending: false, authError: null });
        }
      })
      .catch((error: unknown) => {
        if (!alive || authChanged) return;
        console.error("[auth] Initial session resolution failed", {
          message: error instanceof Error ? error.message : "Unknown session error",
        });
        setState({
          user: null,
          isPending: false,
          authError: "Your secure session could not be restored. Retry before opening protected workspace data.",
        });
      });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [attempt]);

  return { ...state, retry };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
