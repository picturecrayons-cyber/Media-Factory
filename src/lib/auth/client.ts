import { GROK_PROVIDERS } from "./providers";

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";
export { GROK_PROVIDERS };

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const STORAGE_KEY = "crayons-bridge.supabase-session";
const AUTH_EVENT = "crayons-bridge-auth-change";

type SupabaseUser = {
  id: string;
  email?: string | null;
  user_metadata?: { name?: string; full_name?: string; avatar_url?: string };
};

type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user: SupabaseUser;
};

function config() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url: SUPABASE_URL, key: SUPABASE_KEY };
}

function emitAuthChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVENT));
}

function readSession(): SupabaseSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SupabaseSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: SupabaseSession | null) {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(STORAGE_KEY);
  emitAuthChange();
}

async function authRequest(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.msg ?? body?.message ?? body?.error_description ?? body?.error ?? "Authentication failed");
  }
  return body;
}

async function refreshSession(session: SupabaseSession): Promise<SupabaseSession | null> {
  try {
    const body = await authRequest("token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const next = body as SupabaseSession;
    writeSession(next);
    return next;
  } catch {
    writeSession(null);
    return null;
  }
}

export async function getSupabaseSession(): Promise<SupabaseSession | null> {
  const session = readSession();
  if (!session) return null;
  const expiresAt = session.expires_at ?? 0;
  if (expiresAt && expiresAt * 1000 > Date.now() + 60_000) return session;
  return refreshSession(session);
}

export function getBearerToken(): string | null {
  return readSession()?.access_token ?? null;
}

export async function signUpWithEmail(input: { email: string; password: string; name: string }) {
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/onboarding` : undefined;
  const body = await authRequest("signup", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      data: { name: input.name, full_name: input.name },
      gotrue_meta_security: {},
      ...(redirectTo ? { email_redirect_to: redirectTo } : {}),
    }),
  });
  if (body?.access_token && body?.refresh_token) writeSession(body as SupabaseSession);
  return { user: body?.user ?? body, session: body?.access_token ? body : null };
}

export async function signInWithEmail(email: string, password: string) {
  const body = (await authRequest("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })) as SupabaseSession;
  writeSession(body);
  return body;
}

export async function signOut(redirectTo = "/"): Promise<void> {
  const session = readSession();
  if (session?.access_token) {
    try {
      await authRequest("logout", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
    } catch {
      // Clear the local session even if the remote session is already expired.
    }
  }
  writeSession(null);
  if (typeof window !== "undefined") window.location.assign(redirectTo);
}

export async function signIn(_providerId: string): Promise<void> {
  throw new Error("Social sign-in is temporarily unavailable while Bridge uses Supabase Auth. Use email and password.");
}

export function subscribeAuthChange(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(AUTH_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTH_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getStoredSupabaseUser(): SupabaseUser | null {
  return readSession()?.user ?? null;
}
