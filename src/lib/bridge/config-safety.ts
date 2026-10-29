/**
 * Fail-closed checks for shared integration configuration.
 *
 * These helpers intentionally report configuration categories only; never include
 * URLs, usernames, passwords, keys, or other secret-bearing values in errors.
 */

export function firstNonBlank(...values: Array<string | undefined | null>): string | undefined {
  return values.map((value) => value?.trim()).find((value) => Boolean(value));
}

export function resolveConsistentAlias(
  label: string,
  ...values: Array<string | undefined | null>
): string | undefined {
  const configured = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  const unique = [...new Set(configured)];
  if (unique.length > 1) {
    throw new Error("CONFIG_MISMATCH: conflicting " + label + " aliases are configured.");
  }
  return unique[0];
}

export function supabaseProjectRefFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/** Resolve a project ref from direct Supabase Postgres or its project-specific pooler username. */
export function supabaseProjectRefFromDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const direct = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (direct) return direct[1].toLowerCase();
    if (url.hostname.toLowerCase().endsWith(".pooler.supabase.com")) {
      const username = decodeURIComponent(url.username);
      const projectMatch = username.match(/(?:^|\.)([a-z0-9]{10,})(?:$|\.)/i);
      return projectMatch?.[1]?.toLowerCase();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Reject only when both endpoints identify Supabase projects and those refs differ. */
export function assertDatabaseMatchesSupabase(
  supabaseUrl: string | undefined,
  databaseUrl: string | undefined,
): void {
  const supabaseRef = supabaseProjectRefFromUrl(supabaseUrl);
  const databaseRef = supabaseProjectRefFromDatabaseUrl(databaseUrl);
  if (supabaseRef && databaseRef && supabaseRef !== databaseRef) {
    throw new Error("CONFIG_MISMATCH: Supabase API and PostgreSQL endpoints target different projects.");
  }
}

/** Detect accidental alias drift without exposing either configured value. */
export function assertConsistentIntegrationAliases(
  label: string,
  ...values: Array<string | undefined | null>
): void {
  resolveConsistentAlias(label, ...values);
}
