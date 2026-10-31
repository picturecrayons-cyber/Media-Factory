const DATABASE_URL_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_DATABASE_URL",
] as const;

/**
 * Select the first non-empty server-side Postgres URL alias.
 * Empty Vercel variables must not mask a configured fallback alias.
 */
export function resolveDatabaseUrlCandidate(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  for (const key of DATABASE_URL_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
