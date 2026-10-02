import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import { GROK_PROVIDERS } from "./providers";
import { restoreSupabaseSession } from "./session-restoration";

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";
export { GROK_PROVIDERS };

export type SupabaseUser = User;
export type SupabaseSession = Session;
export { getPasswordRecoveryRedirectUrl, RECOVERY_MARKER_KEY } from "./recovery-url";
import { getPasswordRecoveryRedirectUrl, RECOVERY_MARKER_KEY } from "./recovery-url";

export function markRecoverySession(accessToken: string): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem(RECOVERY_MARKER_KEY, accessToken);
}

export async function hasSupabaseRecoverySession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const { data, error } = await supabase.auth.getSession();
  return !error && !!data.session?.access_token &&
    window.sessionStorage.getItem(RECOVERY_MARKER_KEY) === data.session.access_token;
}

export async function getSupabaseSession(
  opts: { forceRefresh?: boolean } = {},
): Promise<Session | null> {
  // The SDK waits for URL/session restoration and owns refresh-token rotation.
  // A separate cache can return expired tokens after a reload or failed refresh.
  try {
    return await restoreSupabaseSession(supabase.auth, opts);
  } catch (err) {
    console.warn("[auth] Session restoration failed:", err);
    return null;
  }
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
  return data.session;
}

export async function resetPasswordForEmail(email: string) {
  const redirectTo = getPasswordRecoveryRedirectUrl();

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
    listener(event, session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export function getStoredSupabaseUser(): User | null {
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
