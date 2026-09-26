import { useEffect, useState } from "react";
import { authEnabled, getStoredSupabaseUser, getSupabaseSession, subscribeAuthChange } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: boolean;
};

export const DEV_USER: AppUser = { id: "dev-user", displayName: "Dev User", primaryEmail: "dev@example.com", profileImageUrl: null, isDevFallback: true };
export type CurrentUserState = { user: AppUser | null; isPending: boolean };

function normalize(user: ReturnType<typeof getStoredSupabaseUser>): AppUser | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.user_metadata?.name ?? user.user_metadata?.full_name ?? null,
    primaryEmail: user.email ?? null,
    profileImageUrl: user.user_metadata?.avatar_url ?? null,
    isDevFallback: false,
  };
}

export function useCurrentUserState(): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>(() => authEnabled ? { user: normalize(getStoredSupabaseUser()), isPending: true } : { user: DEV_USER, isPending: false });

  useEffect(() => {
    if (!authEnabled) return;
    let alive = true;
    const resolve = () => {
      void getSupabaseSession().then((session) => {
        if (alive) setState({ user: normalize(session?.user ?? null), isPending: false });
      });
    };
    resolve();
    const unsubscribe = subscribeAuthChange(resolve);
    return () => { alive = false; unsubscribe(); };
  }, []);

  return state;
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
