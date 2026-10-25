/**
 * Resolve the single canonical Supabase project URL used by browser and server code.
 * VITE_SUPABASE_URL is intentionally required in every runtime; server-only aliases must
 * not silently bind authentication or Bridge operations to a different Supabase project.
 */
export function resolveCanonicalSupabaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed || undefined;
}
