export type DatabaseEnvironment = Record<string, string | undefined>;

const DATABASE_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_DATABASE_URL",
] as const;

function projectRefFromSupabaseUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    const match = url.hostname.match(/^([a-z0-9-]+)\\.supabase\\.co$/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function projectRefFromDatabaseUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.hostname.endsWith(".supabase.co")) {
      return url.hostname.match(/^db\\.([a-z0-9-]+)\\.supabase\\.co$/i)?.[1];
    }
    // Supabase pooler usernames are scoped as postgres.<project-ref>.
    if (url.hostname.endsWith(".pooler.supabase.com")) {
      return url.username.match(/(?:^|\\.)([a-z0-9-]{16,})(?:\\.|$)/i)?.[1];
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Select the first configured PostgreSQL URL that belongs to the same Supabase
 * project as SUPABASE_URL. On Vercel this prevents a stale higher-priority
 * DATABASE_URL from shadowing a valid Testing DB POSTGRES_URL.
 *
 * Local development retains the established precedence when no Supabase target
 * is configured. Never returns or logs a credential in diagnostics.
 */
export function resolveBridgeDatabaseUrl(env: DatabaseEnvironment): string | undefined {
  const candidates = DATABASE_KEYS.flatMap((key) => {
    const value = env[key]?.trim();
    return value ? [{ key, value }] : [];
  });

  const isVercel = Boolean(env.VERCEL);
  const expectedRef =
    projectRefFromSupabaseUrl(env.SUPABASE_URL) ??
    projectRefFromSupabaseUrl(env.VITE_SUPABASE_URL) ??
    projectRefFromSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);

  if (!isVercel && !expectedRef) return candidates[0]?.value;

  if (!expectedRef) {
    throw new Error(
      "DATABASE_TARGET_MISMATCH: a canonical SUPABASE_URL project target is required on Vercel.",
    );
  }

  for (const candidate of candidates) {
    let parsed: URL;
    try {
      parsed = new URL(candidate.value);
    } catch {
      throw new Error(`Invalid Bridge database binding in ${candidate.key}.`);
    }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error(`Invalid Bridge database protocol in ${candidate.key}.`);
    }
    if (projectRefFromDatabaseUrl(candidate.value) === expectedRef) {
      return candidate.value;
    }
  }

  if (candidates.length === 0) return undefined;
  throw new Error(
    `DATABASE_TARGET_MISMATCH: configured PostgreSQL URLs do not target the canonical Supabase project ${expectedRef}. No database connection was opened.`,
  );
}
