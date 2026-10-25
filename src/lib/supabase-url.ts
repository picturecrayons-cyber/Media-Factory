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
