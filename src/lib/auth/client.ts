import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import { GROK_PROVIDERS } from "./providers";

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";
export { GROK_PROVIDERS };

export type SupabaseUser = User;
export type SupabaseSession = Session;

let cachedSession: Session | null = null;
let sessionPromise: Promise<Session | null> | null = null;

export async function getSupabaseSession(): Promise<Session | null> {
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

export function getBearerToken(): string | null {
  if (cachedSession?.access_token) return cachedSession.access_token;
  if (typeof window !== "undefined") {
    // Check Supabase's local storage key
    try {
      const stored = window.localStorage.getItem("crayons-bridge.sb-auth-token");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.access_token) return parsed.access_token;
      }
    } catch {
      // ignore
    }
  }
  return null;
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
  const redirectTo = `${origin}/reset-password`;

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) throw error;
  return data;
}

export async function updatePassword(password: string) {
  const { data, error } = await supabase.auth.updateUser({
    password,
  });

  if (error) throw error;
  return data.user;
}

export async function signOut(redirectTo = "/login"): Promise<void> {
  cachedSession = null;
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
