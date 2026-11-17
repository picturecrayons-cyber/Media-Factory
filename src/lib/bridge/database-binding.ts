import { CANONICAL_SUPABASE_REF, STAGING_SUPABASE_REF } from "./canonical.ts";

type DatabaseBindingEnv = {
  VERCEL_ENV?: string;
  BRIDGE_DATABASE_TARGET?: string;
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
  SUPABASE_DB_URL?: string;
  SUPABASE_DATABASE_URL?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

function firstConfigured(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

function projectRefFromSupabaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]{20})\\.supabase\\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function databaseMatchesProject(selected: string, expectedRef: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(selected.trim());
  } catch {
    throw new Error("The Bridge database binding is not a valid PostgreSQL URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("The Bridge database binding must use postgres:// or postgresql://.");
  }
  const hostMatches = parsed.hostname.toLowerCase() === `db.${expectedRef}.supabase.co`;
  let username = parsed.username.toLowerCase();
  try {
    username = decodeURIComponent(username);
  } catch {
    throw new Error("The Bridge database binding has an invalid encoded username.");
  }
  const poolerUsernameMatches = username.split(".").includes(expectedRef);
  return hostMatches || poolerUsernameMatches;
}

/**
 * Preview is fail-closed and may connect only to the approved Testing DB.
 * Production is pinned to the canonical Production project. Local retains its
 * existing configured binding for developer workflows.
 */
export function resolveBridgeDatabaseUrl(env: DatabaseBindingEnv): string | undefined {
  const selected = firstConfigured(
    env.DATABASE_URL,
    env.POSTGRES_URL,
    env.SUPABASE_DB_URL,
    env.SUPABASE_DATABASE_URL,
  );

  if (env.VERCEL_ENV === "preview" && env.BRIDGE_DATABASE_TARGET !== "staging") {
    throw new Error(
      "Bridge Preview is blocked: BRIDGE_DATABASE_TARGET must explicitly equal staging. Production database fallback is forbidden.",
    );
  }

  if (env.VERCEL_ENV !== "preview" && env.VERCEL_ENV !== "production") return selected;

  const expectedRef = projectRefFromSupabaseUrl(
    firstConfigured(env.SUPABASE_URL, env.VITE_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL),
  );
  const allowedRef = env.VERCEL_ENV === "preview" ? STAGING_SUPABASE_REF : CANONICAL_SUPABASE_REF;
  const environmentLabel = env.VERCEL_ENV === "preview" ? "STAGING" : "Production";

  if (expectedRef !== allowedRef) {
    throw new Error(`Bridge ${environmentLabel} must use its explicitly approved Supabase project URL.`);
  }
  if (!selected) {
    throw new Error(`A PostgreSQL database URL for the approved Bridge ${environmentLabel} project is required.`);
  }
  if (!databaseMatchesProject(selected, allowedRef)) {
    throw new Error(
      `Bridge database binding does not match the approved ${environmentLabel} Supabase project; refusing the connection.`,
    );
  }
  return selected;
}
