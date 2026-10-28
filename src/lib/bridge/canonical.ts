/** Canonical StreamVista / Crayons Bridge infrastructure pins. Never print secret values. */

export const CANONICAL_SUPABASE_REF = "mlmgugivsyoxzdgwkbpu";
export const FORBIDDEN_SUPABASE_REFS = ["tqzimuwozhipqgyerdff", "uakpqqardziifcwzvgfx"] as const;
export const CANONICAL_SUPABASE_URL = `https://${CANONICAL_SUPABASE_REF}.supabase.co`;
/**
 * An explicitly isolated non-production Auth target. This is deliberately
 * separate from the canonical infrastructure pin and is never a fallback.
 */
export const TEST_AUTH_SUPABASE_REF = "jbymleftneggcgutlcqu";
export const TEST_AUTH_SUPABASE_URL = `https://${TEST_AUTH_SUPABASE_REF}.supabase.co`;

export function resolveTestAuthSupabaseUrl(
  enabled: boolean | undefined,
  url: string | undefined,
  publishableKey: string | undefined,
): string {
  if (enabled !== true) {
    throw new Error("Test Auth configuration is disabled.");
  }
  const normalizedUrl = url?.trim().replace(/\/+$/, "");
  if (normalizedUrl !== TEST_AUTH_SUPABASE_URL) {
    throw new Error("Test Auth Supabase URL must match the dedicated test project.");
  }
  if (!publishableKey?.trim() || publishableKey.trim().startsWith("sb_secret_")) {
    throw new Error("Test Auth requires a test-project publishable key, never a secret key.");
  }
  return TEST_AUTH_SUPABASE_URL;
}

export const PRODUCT_NAME = "Crayons Bridge";
export const LEGAL_OWNER = "StreamVista OPC Pvt Ltd";
export const PRODUCTION_DOMAIN = "www.crayonspictures.in";
export const TRANSACTIONAL_FROM = "abijithasokan@crayonspictures.com";
export const VERCEL_PROJECT = "bridge";

export function supabaseRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function assertCanonicalSupabaseUrl(url: string | undefined): string {
  const ref = supabaseRefFromUrl(url);
  if (ref && (FORBIDDEN_SUPABASE_REFS as readonly string[]).includes(ref)) {
    throw new Error("Forbidden Supabase project ref — canonical project only.");
  }
  if (url && ref && ref !== CANONICAL_SUPABASE_REF) {
    throw new Error("Non-canonical Supabase project is not allowed.");
  }
  return CANONICAL_SUPABASE_URL;
}

export function databaseUrlLooksForbidden(connectionString: string | undefined): boolean {
  if (!connectionString) return false;
  return (FORBIDDEN_SUPABASE_REFS as readonly string[]).some((ref) =>
    connectionString.includes(ref),
  );
}
