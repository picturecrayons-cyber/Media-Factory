/** Canonical StreamVista / Crayons Bridge infrastructure pins. Never print secret values. */

export const CANONICAL_SUPABASE_REF = "uakpqqardziifcwzvgfx";
export const FORBIDDEN_SUPABASE_REFS = ["tqzimuwozhipqgyerdff"] as const;
export const CANONICAL_SUPABASE_URL = `https://${CANONICAL_SUPABASE_REF}.supabase.co`;
export const PRODUCT_NAME = "Crayons Bridge";
export const LEGAL_OWNER = "StreamVista OPC Pvt Ltd";
export const PRODUCTION_DOMAIN = "bridge.crayonspictures.com";
export const TRANSACTIONAL_FROM = "abijithasokan@crayonspictures.com";
export const VERCEL_PROJECT = "bridge";
export const HOSTINGER_SMTP_HOST = "smtp.hostinger.com";
export const HOSTINGER_SMTP_PORT = "465";

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
