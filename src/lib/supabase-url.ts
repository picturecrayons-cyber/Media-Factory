/**
 * Resolve one Supabase URL across Vite/browser and server runtimes.
 * Empty aliases are ignored. If multiple aliases are configured, they must
 * identify the same URL; silently choosing between projects is unsafe.
 */
export const PRODUCTION_SUPABASE_REF = "mlmgugivsyoxzdgwkbpu";
/** STAGING DB / dedicated Testing project; never the Production project. */
export const STAGING_SUPABASE_REF = "jbymleftneggcgutlcqu";

export function resolveCanonicalSupabaseUrl(
  ...values: Array<string | undefined>
): string | undefined {
  const normalized = values
    .map((value) => value?.trim().replace(/\/+$/, ""))
    .filter((value): value is string => Boolean(value));

  const unique = [...new Set(normalized)];
  if (unique.length > 1) {
    throw new Error("CONFIG_MISSING: Supabase URL aliases resolve to different projects.");
  }
  return unique[0];
}

function expectedSupabaseRef(vercelEnv: string | undefined): string {
  if (vercelEnv === "production") return PRODUCTION_SUPABASE_REF;
  if (vercelEnv === "preview" || vercelEnv === "development") return STAGING_SUPABASE_REF;
  throw new Error("CONFIG_MISSING: Vercel runtime environment is missing or unsupported.");
}

/**
 * Enforce the project boundary before a browser/server Supabase client is made.
 * Preview and Vercel Development are pinned to the STAGING DB / Testing project.
 */
export function assertSupabaseUrlForRuntime(
  value: string | undefined,
  vercelEnv?: string,
): string | undefined {
  const url = value?.trim().replace(/\/+$/, "");
  if (!vercelEnv) return url;
  const expectedRef = expectedSupabaseRef(vercelEnv);
  if (!url) {
    throw new Error(
      vercelEnv === "production"
        ? "CONFIG_MISSING: PRODUCTION DB Supabase URL is required."
        : "CONFIG_MISSING: STAGING DB Supabase URL is required for Preview isolation.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("CONFIG_MISSING: Supabase URL is invalid.");
  }
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== `${expectedRef}.supabase.co`) {
    throw new Error(
      vercelEnv === "production"
        ? "CONFIG_MISSING: PRODUCTION runtime must use the canonical PRODUCTION DB project."
        : "CONFIG_MISSING: Preview runtime must use only the isolated STAGING DB / Testing project.",
    );
  }
  return url;
}

/** Validate Vercel's Postgres binding without opening a connection. */
export function assertDatabaseUrlForRuntime(
  connectionString: string | undefined,
  vercelEnv?: string,
): string | undefined {
  if (!vercelEnv) return connectionString;
  const expectedRef = expectedSupabaseRef(vercelEnv);
  if (!connectionString?.trim()) {
    throw new Error(
      vercelEnv === "production"
        ? "CONFIG_MISSING: PRODUCTION DB connection is required on Vercel."
        : "CONFIG_MISSING: STAGING DB connection is required on Vercel Preview.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString.trim());
  } catch {
    throw new Error("CONFIG_MISSING: Postgres connection URL is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("CONFIG_MISSING: Postgres connection URL must use postgres:// or postgresql://.");
  }

  const direct = parsed.hostname.toLowerCase().match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  const poolerUser = decodeURIComponent(parsed.username);
  const pooler = parsed.hostname.toLowerCase().endsWith(".pooler.supabase.com") &&
    poolerUser === `postgres.${expectedRef}`;
  const actualRef = direct?.[1] ?? (pooler ? expectedRef : null);
  if (actualRef !== expectedRef) {
    throw new Error(
      vercelEnv === "production"
        ? "CONFIG_MISSING: PRODUCTION DB connection is not bound to the canonical Production project."
        : "CONFIG_MISSING: Preview DB connection is not bound to the isolated STAGING DB / Testing project.",
    );
  }
  return connectionString;
}
