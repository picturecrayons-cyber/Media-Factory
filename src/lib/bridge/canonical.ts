/** Canonical StreamVista / Crayons Bridge infrastructure pins. Never print secret values. */

export const CANONICAL_SUPABASE_REF = "mlmgugivsyoxzdgwkbpu";
export const STAGING_SUPABASE_REF = "jbymleftneggcgutlcqu";
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
    const host = new URL(url).hostname;
    const m = host.match(/^([a-z0-9]+)\\.supabase\\.co$/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Resolve the public Supabase API URL without allowing environment crossover. */
export function resolveBridgeSupabaseUrl(env: {
  VERCEL_ENV?: string;
  BRIDGE_DATABASE_TARGET?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
}): string {
  const configured = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = supabaseRefFromUrl(configured);
  if (env.VERCEL_ENV === "preview") {
    if (env.BRIDGE_DATABASE_TARGET !== "staging") {
      throw new Error("Bridge Preview is blocked: BRIDGE_DATABASE_TARGET must explicitly equal staging.");
    }
    if (ref !== STAGING_SUPABASE_REF) {
      throw new Error("Bridge Preview must use the explicitly approved STAGING Supabase project.");
    }
    return STAGING_SUPABASE_URL;
  }
  if (env.VERCEL_ENV === "production") {
    if (configured && ref !== CANONICAL_SUPABASE_REF) {
      throw new Error("Bridge Production is pinned to the canonical Production Supabase project.");
    }
    return CANONICAL_SUPABASE_URL;
  }
  if (configured && !ref) throw new Error("Configured Supabase URL is invalid or not a Supabase project URL.");
  return configured ?? CANONICAL_SUPABASE_URL;
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
