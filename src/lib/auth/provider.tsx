import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseSessionStrict, subscribeAuthChange } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  /** Untrusted role hint from signup metadata; server authorization never trusts this field. */
  signupAccountTypeHint: string | null;
};

export type AuthSessionState = {
  user: AppUser | null;
  session: Session | null;
  isPending: boolean;
  authError: string | null;
  retry: () => void;
};

function normalize(user: User | null | undefined): AppUser | null {
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

const AuthSessionContext = createContext<AuthSessionState>({
  user: null,
  session: null,
  isPending: true,
  authError: null,
  retry: () => {},
});

export function useAuthSessionState(): AuthSessionState {
  return useContext(AuthSessionContext);
}

/**
 * One app-wide auth bootstrap. Protected routes and their data-fetching
 * descendants are not mounted until the auth listener and initial session read
 * have settled. Auth events always outrank an older in-flight getSession read.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const authRevision = useRef(0);

  useEffect(() => {
    let alive = true;
    let authChanged = false;
    let revisionBeforeRead = authRevision.current;
    setIsPending(true);
    setAuthError(null);

    const unsubscribe = subscribeAuthChange((event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      setUser(normalize(nextSession?.user));
      if (event !== "INITIAL_SESSION") {
        authRevision.current += 1;
        authChanged = true;
        setAuthError(null);
        setIsPending(false);
      }
    });

    void getSupabaseSessionStrict()
      .then((restoredSession) => {
        if (alive && !authChanged && authRevision.current === revisionBeforeRead) {
          setSession(restoredSession);
          setUser(normalize(restoredSession?.user));
          setAuthError(null);
          setIsPending(false);
        }
      })
      .catch((error: unknown) => {
        if (!alive || authChanged || authRevision.current !== revisionBeforeRead) return;
        console.error("[auth] Initial Bridge session resolution failed", {
          message: error instanceof Error ? error.message : "Unknown session error",
        });
        setSession(null);
        setUser(null);
        setAuthError("Your secure session could not be restored. Retry before opening protected workspace data.");
        setIsPending(false);
      });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [attempt]);

  const retry = () => setAttempt((value) => value + 1);
  const state: AuthSessionState = { user, session, isPending, authError, retry };

  if (isPending) {
    return (
      <AuthSessionContext.Provider value={state}>
        <main className="grid min-h-screen place-items-center bg-bg p-6">
          <p role="status" aria-live="polite" className="text-sm text-muted">Securing your Bridge session…</p>
        </main>
      </AuthSessionContext.Provider>
    );
  }

  if (authError) {
    return (
      <AuthSessionContext.Provider value={state}>
        <main className="grid min-h-screen place-items-center bg-bg p-6">
          <section role="alert" className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-7 text-center">
            <h1 className="font-display text-2xl text-fg">Secure session unavailable</h1>
            <p className="text-sm text-muted">{authError}</p>
            <button type="button" onClick={retry} className="h-11 rounded-full bg-accent px-5 text-sm font-semibold text-white">Retry session</button>
          </section>
        </main>
      </AuthSessionContext.Provider>
    );
  }

  return <AuthSessionContext.Provider value={state}>{children}</AuthSessionContext.Provider>;
}
