import { useEffect, useState } from "react";
import { getStoredSupabaseUser, getSupabaseSession, subscribeAuthChange } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
};

export type CurrentUserState = { user: AppUser | null; isPending: boolean };

function normalize(user: ReturnType<typeof getStoredSupabaseUser>): AppUser | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.user_metadata?.name ?? user.user_metadata?.full_name ?? null,
    primaryEmail: user.email ?? null,
    profileImageUrl: user.user_metadata?.avatar_url ?? null,
  };
}

export function useCurrentUserState(): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>(() => ({
    user: normalize(getStoredSupabaseUser()),
    isPending: true,
  }));

  useEffect(() => {
    let alive = true;
    const resolve = () => {
      void getSupabaseSession().then((session) => {
        if (alive) {
          setState({ user: normalize(session?.user ?? null), isPending: false });
        }
      });
    };
    resolve();
    const unsubscribe = subscribeAuthChange((_event, session) => {
      if (alive) {
        setState({ user: normalize(session?.user ?? null), isPending: false });
      }
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return state;
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
