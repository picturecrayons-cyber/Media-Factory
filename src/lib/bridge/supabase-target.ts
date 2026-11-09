export const BRIDGE_PRODUCTION_SUPABASE_URL = "https://mlmgugivsyoxzdgwkbpu.supabase.co";
export const BRIDGE_PRODUCTION_SUPABASE_REF = "mlmgugivsyoxzdgwkbpu";
export const BRIDGE_PREVIEW_SUPABASE_URL = "https://bbtrosuwisnxacuxvegt.supabase.co";
export const BRIDGE_PREVIEW_SUPABASE_REF = "bbtrosuwisnxacuxvegt";

export function resolveBridgeSupabaseTarget(
  urlValue: string | undefined,
  environmentValue: string | undefined,
  expectedProjectRefValue?: string,
): { url: string; projectRef: string } | null {
  const url = (urlValue || "").trim().replace(/\/$/, "");
  const environment = (environmentValue || "").trim().toLowerCase();
  const expected = (expectedProjectRefValue || "").trim();
  if (!url) return null;

  if (environment === "preview") {
    return url === BRIDGE_PREVIEW_SUPABASE_URL && expected === BRIDGE_PREVIEW_SUPABASE_REF
      ? { url, projectRef: BRIDGE_PREVIEW_SUPABASE_REF }
      : null;
  }

  if (environment === "test") {
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) return { url, projectRef: "local" };
    if (url === BRIDGE_PREVIEW_SUPABASE_URL && (!expected || expected === BRIDGE_PREVIEW_SUPABASE_REF)) {
      return { url, projectRef: BRIDGE_PREVIEW_SUPABASE_REF };
    }
    if (url === BRIDGE_PRODUCTION_SUPABASE_URL && (!expected || expected === BRIDGE_PRODUCTION_SUPABASE_REF)) {
      return { url, projectRef: BRIDGE_PRODUCTION_SUPABASE_REF };
    }
    return null;
  }

  if (environment === "development" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    return { url, projectRef: "local" };
  }

  if (environment !== "production" && environment !== "development") return null;
  if (url !== BRIDGE_PRODUCTION_SUPABASE_URL || (expected && expected !== BRIDGE_PRODUCTION_SUPABASE_REF)) {
    return null;
  }
  return { url, projectRef: BRIDGE_PRODUCTION_SUPABASE_REF };
}
