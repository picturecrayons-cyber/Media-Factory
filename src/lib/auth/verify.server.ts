import { gateIdentityEnabled } from "./gate-identity.server";

const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim());
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const authConfigured = process.env.VITE_AUTH_ENABLED !== "false" && Boolean(supabaseUrl && supabasePublishableKey);

if (databaseConfigured && !authConfigured) {
  console.error("[auth] Database is configured but Supabase Auth is not — protected requests fail closed.");
}

export const DEV_USER_ID = "dev-user";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() { super("Unauthorized"); this.name = "UnauthorizedError"; }
}

export type VerifiedUser = { id: string; email: string | null };

export async function getSessionUser(bearerToken?: string): Promise<VerifiedUser | null> {
  if (!authConfigured && !gateIdentityEnabled()) return null;
  if (!bearerToken || !supabaseUrl || !supabasePublishableKey) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${bearerToken}` },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string; email?: string | null };
  if (!user.id) return null;
  return { id: user.id, email: user.email ?? null };
}

export async function requireUserId(bearerToken?: string): Promise<string> {
  if (!authConfigured && !gateIdentityEnabled()) {
    if (databaseConfigured) throw new Error("Supabase Auth is disabled while a real database is configured — refusing dev-user fallback.");
    return DEV_USER_ID;
  }
  const user = await getSessionUser(bearerToken);
  if (!user) throw new UnauthorizedError();
  return user.id;
}
