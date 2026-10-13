/** Canonical StreamVista / Crayons Bridge infrastructure pins. Never print secret values. */

export const CANONICAL_SUPABASE_REF = "mlmgugivsyoxzdgwkbpu";
export const STAGING_SUPABASE_REF = "bbtrosuwisnxacuxvegt";
export const FORBIDDEN_SUPABASE_REFS = ["tqzimuwozhipqgyerdff", "uakpqqardziifcwzvgfx"] as const;
export const CANONICAL_SUPABASE_URL = `https://${CANONICAL_SUPABASE_REF}.supabase.co`;
export const STAGING_SUPABASE_URL = `https://${STAGING_SUPABASE_REF}.supabase.co`;
export const PRODUCT_NAME = "Crayons Bridge";
export const LEGAL_OWNER = "StreamVista OPC Pvt Ltd";
export const PRODUCTION_DOMAIN = "www.crayonspictures.in";
export const TRANSACTIONAL_FROM = "abijithasokan@crayonspictures.com";
export const VERCEL_PROJECT = "bridge";

export function supabaseRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const m = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Fail-closed app target selection.
 * Preview may use only the explicitly allowlisted staging project and must set
 * both VITE_BRIDGE_DEPLOY_ENV=preview and VITE_BRIDGE_EXPECTED_SUPABASE_REF.
 * All other environments resolve to the canonical Production project only.
 */
export function resolveConfiguredSupabaseUrl(
  url: string | undefined,
  deployEnvironment: string | undefined,
  expectedRef: string | undefined,
): string {
  const ref = supabaseRefFromUrl(url);
  if (!ref) throw new Error("Invalid Supabase URL configuration.");
  if ((FORBIDDEN_SUPABASE_REFS as readonly string[]).includes(ref)) {
    throw new Error("Forbidden Supabase project ref.");
  }

  if (deployEnvironment === "preview") {
    if (expectedRef !== STAGING_SUPABASE_REF || ref !== STAGING_SUPABASE_REF) {
      throw new Error("Preview must explicitly target the approved staging Supabase project.");
    }
    return STAGING_SUPABASE_URL;
  }

  if (ref !== CANONICAL_SUPABASE_REF || (expectedRef && expectedRef !== CANONICAL_SUPABASE_REF)) {
    throw new Error("Production/local default must target the canonical Supabase project.");
  }
  return CANONICAL_SUPABASE_URL;
}

export function assertCanonicalSupabaseUrl(url: string | undefined): string {
  return resolveConfiguredSupabaseUrl(url, "production", CANONICAL_SUPABASE_REF);
}

export function databaseUrlLooksForbidden(connectionString: string | undefined): boolean {
  if (!connectionString) return false;
  return (FORBIDDEN_SUPABASE_REFS as readonly string[]).some((ref) =>
    connectionString.includes(ref),
  );
}
