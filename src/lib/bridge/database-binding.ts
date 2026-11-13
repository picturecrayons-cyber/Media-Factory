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
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Select a server-side Postgres binding.
 *
 * Every Vercel Preview is fail-closed unless it is explicitly marked STAGING
 * and its PostgreSQL host/pooler username proves the same Supabase project as
 * the configured Supabase API URL. A missing or mistyped target must never
 * silently fall through to a Production database binding.
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

  if (env.VERCEL_ENV !== "preview") return selected;

  if (!selected) {
    throw new Error(
      "DATABASE_URL or POSTGRES_URL for the approved STAGING Supabase project is required on Bridge Preview.",
    );
  }

  const expectedRef = projectRefFromSupabaseUrl(
    firstConfigured(env.SUPABASE_URL, env.VITE_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL),
  );
  if (!expectedRef) {
    throw new Error("A valid STAGING Supabase URL is required to verify the Preview database binding.");
  }

  let parsed: URL;
  try {
    parsed = new URL(selected.trim());
  } catch {
    throw new Error("The Preview STAGING database binding is not a valid PostgreSQL URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("The Preview STAGING database binding must use postgres:// or postgresql://.");
  }

  const hostMatches = parsed.hostname.toLowerCase() === `db.${expectedRef}.supabase.co`;
  let username = parsed.username.toLowerCase();
  try {
    username = decodeURIComponent(username);
  } catch {
    throw new Error("The Preview STAGING database binding has an invalid encoded username.");
  }
  const poolerUsernameMatches = username.split(".").includes(expectedRef);
  if (!hostMatches && !poolerUsernameMatches) {
    throw new Error(
      "Preview database binding does not match the configured STAGING Supabase project; refusing the connection.",
    );
  }

  return selected;
}
