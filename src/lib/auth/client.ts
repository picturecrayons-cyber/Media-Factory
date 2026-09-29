import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import { GROK_PROVIDERS } from "./providers";

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";
export { GROK_PROVIDERS };

export type SupabaseUser = User;
export type SupabaseSession = Session;
const RECOVERY_MARKER_KEY = "crayons-bridge.supabase-recovery-session";

export function markRecoverySession(accessToken: string): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem(RECOVERY_MARKER_KEY, accessToken);
}

export async function hasSupabaseRecoverySession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const { data, error } = await supabase.auth.getSession();
  return !error && !!data.session?.access_token &&
    window.sessionStorage.getItem(RECOVERY_MARKER_KEY) === data.session.access_token;
}

let cachedSession: Session | null = null;
let sessionPromise: Promise<Session | null> | null = null;

export async function getSupabaseSession(opts: { forceRefresh?: boolean } = {}): Promise<Session | null> {
  if (opts.forceRefresh) {
    cachedSession = null;
    sessionPromise = null;
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session) {
      cachedSession = refreshed.session;
      return refreshed.session;
    }
  }
  if (cachedSession) return cachedSession;
  if (!sessionPromise) {
    sessionPromise = supabase.auth.getSession().then(({ data, error }) => {
      sessionPromise = null;
      if (error) {
        console.warn("[auth] Failed to retrieve session:", error.message);
        return null;
      }
      cachedSession = data.session;
      return data.session;
    }).catch((err) => {
      sessionPromise = null;
      console.warn("[auth] getSession error:", err);
      return null;
    });
  }
  return sessionPromise;
}

export async function getBearerToken(): Promise<string | null> {
  const session = await getSupabaseSession();
  return session?.access_token ?? null;
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  name: string;
  accountType?: "independent_creator" | "studio" | "buyer";
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://bridge.crayonspictures.com";
  const callbackUrl = `${origin}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        name: input.name,
        full_name: input.name,
        account_type: input.accountType || "independent_creator",
      },
      emailRedirectTo: callbackUrl,
    },
  });

  if (error) throw error;
  cachedSession = data.session;
  return { user: data.user, session: data.session };
}

export async function resendConfirmationEmail(email: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://bridge.crayonspictures.com";
  const callbackUrl = `${origin}/auth/callback`;

  const { data, error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: callbackUrl,
    },
  });

  if (error) throw error;
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  cachedSession = data.session;
  return data.session;
}

export async function resetPasswordForEmail(email: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://bridge.crayonspictures.com";
  const redirectTo = `${origin}/auth/callback?type=recovery`;

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) throw error;
  return data;
}

export async function updatePassword(password: string) {
  if (!(await hasSupabaseRecoverySession())) throw new Error("Reset link is invalid or expired. Request a new one.");
  const { data, error } = await supabase.auth.updateUser({
    password,
  });

  if (error) throw error;
  if (typeof window !== "undefined") window.sessionStorage.removeItem(RECOVERY_MARKER_KEY);
  return data.user;
}

export async function signOut(redirectTo = "/login"): Promise<void> {
  cachedSession = null;
  if (typeof window !== "undefined") window.sessionStorage.removeItem(RECOVERY_MARKER_KEY);
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("[auth] signOut error:", err);
  }
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("crayons-bridge.sb-auth-token");
    window.location.assign(redirectTo);
  }
}

export async function signIn(_providerId: string): Promise<void> {
  throw new Error("Social sign-in is temporarily unavailable. Use email and password.");
}

export function subscribeAuthChange(listener: (event: string, session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    cachedSession = session;
    listener(event, session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export function getStoredSupabaseUser(): User | null {
  if (cachedSession?.user) return cachedSession.user;
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem("crayons-bridge.sb-auth-token");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.user) return parsed.user as User;
      }
    } catch {
      // ignore
    }
  }
  return null;
}
