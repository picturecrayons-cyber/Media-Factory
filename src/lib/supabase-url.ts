/**
 * Resolve one canonical Supabase URL across Vite/browser and server runtimes.
 * Empty aliases are ignored. If multiple aliases are configured, they must
 * identify the same URL; silently choosing between projects is unsafe.
 */
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


export const BRIDGE_TESTING_SUPABASE_URL = "https://jbymleftneggcgutlcqu.supabase.co";
export const BRIDGE_PRODUCTION_SUPABASE_URL = "https://mlmgugivsyoxzdgwkbpu.supabase.co";

/** Enforce deployment-to-database binding; unknown environments fail closed. */
export function resolveEnvironmentSupabaseUrl(
  environmentValue: string | undefined,
  ...values: Array<string | undefined>
): string | undefined {
  const environment = environmentValue || "development";
  if (environment !== "preview" && environment !== "production" && environment !== "development") {
    throw new Error("CONFIG_MISSING: Unknown Supabase deployment environment.");
  }
  const url = resolveCanonicalSupabaseUrl(...values);
  if (!url) return undefined;

  let isLocal = false;
  try {
    const hostname = new URL(url).hostname;
    isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    isLocal = false;
  }
  const allowed = environment === "production"
    ? url === BRIDGE_PRODUCTION_SUPABASE_URL
    : environment === "preview"
      ? url === BRIDGE_TESTING_SUPABASE_URL
      : url === BRIDGE_TESTING_SUPABASE_URL || isLocal;

  if (!allowed) {
    throw new Error("CONFIG_MISSING: Bridge " + environment + " must use its isolated Supabase project.");
  }
  return url;
}
