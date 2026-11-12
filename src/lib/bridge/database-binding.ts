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

/**
 * Select a server-side Postgres binding. A Preview explicitly marked as STAGING
 * must use an explicit project-scoped URL; Vercel integration POSTGRES_URL is
 * deliberately not a fallback because it may point at an unrelated project.
 */
export function resolveBridgeDatabaseUrl(env: DatabaseBindingEnv): string | undefined {
  const isApprovedStagingPreview =
    env.VERCEL_ENV === "preview" && env.BRIDGE_DATABASE_TARGET === "staging";

  if (!isApprovedStagingPreview) {
    return (
      env.DATABASE_URL ??
      env.POSTGRES_URL ??
      env.SUPABASE_DB_URL ??
      env.SUPABASE_DATABASE_URL
    );
  }

  const selected = env.DATABASE_URL ?? env.SUPABASE_DB_URL ?? env.SUPABASE_DATABASE_URL;
  if (!selected?.trim()) {
    throw new Error(
      "DATABASE_URL for the approved STAGING Supabase project is required on Bridge Preview; the generic POSTGRES_URL fallback is disabled.",
    );
  }

  const expectedRef = projectRefFromSupabaseUrl(
    env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
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
  const username = decodeURIComponent(parsed.username).toLowerCase();
  const poolerUsernameMatches = username.split(".").includes(expectedRef);
  if (!hostMatches && !poolerUsernameMatches) {
    throw new Error(
      "Preview database binding does not match the configured STAGING Supabase project; refusing the connection.",
    );
  }

  return selected;
}
