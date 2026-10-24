/**
 * Server-side Supabase URL resolution shared by auth verification and Bridge
 * integrations. Empty variables are treated as unset; conflicting non-empty
 * URLs fail closed rather than silently binding different code paths to
 * different projects.
 */
function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("[Crayons Bridge] Supabase URL configuration is invalid.");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("[Crayons Bridge] Supabase URL must use HTTPS.");
  }
  return normalized;
}

export function resolveServerSupabaseUrl(): string | undefined {
  const values = [
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ];
  const configured = values
    .map(normalize)
    .filter((value): value is string => Boolean(value));

  if (configured.length === 0) return undefined;
  const unique = new Set(configured);
  if (unique.size !== 1) {
    throw new Error("[Crayons Bridge] Conflicting Supabase URL configuration; refusing ambiguous project binding.");
  }
  return configured[0];
}

export function getSanitizedSupabaseProjectRef(url: string | undefined): string {
  if (!url) return "unconfigured";
  try {
    const hostname = new URL(url).hostname;
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    return match?.[1] ?? "nonstandard-host";
  } catch {
    return "invalid-url";
  }
}
