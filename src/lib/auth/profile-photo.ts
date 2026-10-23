export function resolveProfilePhotoUrl(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;

  // Supabase providers may expose either key. Treat metadata as untrusted:
  // only render HTTPS images and preserve the URL as provided.
  for (const key of ["avatar_url", "picture"]) {
    const value = metadata[key];
    if (typeof value !== "string" || !value.trim()) continue;
    try {
      if (new URL(value).protocol === "https:") return value;
    } catch {
      // Ignore malformed provider metadata and try the next candidate.
    }
  }
  return null;
}
