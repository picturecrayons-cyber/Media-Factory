import { GROK_PROVIDERS } from "./providers";

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";
export { GROK_PROVIDERS };

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const STORAGE_KEY = "crayons-bridge.supabase-session";
const AUTH_EVENT = "crayons-bridge-auth-change";
const RECOVERY_MARKER_KEY = "crayons-bridge.supabase-recovery-session";

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

async function consumeEmailCallback(): Promise<SupabaseSession | null> {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  const callbackType = params.get("type");
  const user = await authRequest("user", { headers: { Authorization: `Bearer ${accessToken}` } }) as SupabaseUser;
  if (!user.id) throw new Error("Email confirmation did not return a valid user.");
  const expiresIn = Number(params.get("expires_in") || 3600);
  const session: SupabaseSession = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user,
  };
  writeSession(session);
  if (callbackType === "recovery") {
    window.sessionStorage.setItem(RECOVERY_MARKER_KEY, accessToken);
  } else {
    window.sessionStorage.removeItem(RECOVERY_MARKER_KEY);
  }
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  return session;
}

export async function getSupabaseSession(): Promise<SupabaseSession | null> {
  const callback = await consumeEmailCallback();
  if (callback) return callback;
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
  const body = await authRequest(`signup${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ""}`, {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      data: { name: input.name, full_name: input.name },
    }),
  });
  if (body?.access_token && body?.refresh_token) writeSession(body as SupabaseSession);
  return { user: body?.user ?? body, session: body?.access_token ? body : null };
}

export async function requestSupabasePasswordReset(email: string): Promise<void> {
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
  await authRequest(`recover${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ""}`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function hasSupabaseRecoverySession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const session = await getSupabaseSession();
  if (!session) return false;
  return window.sessionStorage.getItem(RECOVERY_MARKER_KEY) === session.access_token;
}

export async function updateSupabasePassword(password: string): Promise<void> {
  const session = await getSupabaseSession();
  if (!session || typeof window === "undefined" || window.sessionStorage.getItem(RECOVERY_MARKER_KEY) !== session.access_token) {
    throw new Error("Reset link is invalid or expired. Request a new one.");
  }
  await authRequest("user", {
    method: "PUT",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ password }),
  });
  window.sessionStorage.removeItem(RECOVERY_MARKER_KEY);
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
