const ALLOWED_NEXT_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/workspace",
  "/title/",
  "/buyer",
  "/account",
  "/creator",
  "/studio",
  "/investor",
];

/**
 * Accept only approved same-origin application paths.
 * Reject backslashes before URL parsing because browsers normalize them as
 * separators for special URLs, which can defeat string-prefix checks.
 */
export function sanitizeBridgeNextPath(
  candidate: string | null | undefined,
  origin: string,
): string | null {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return null;
  if (candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) return null;

  try {
    const base = new URL(origin);
    const target = new URL(candidate, base);
    if (target.origin !== base.origin) return null;
    if (!ALLOWED_NEXT_PREFIXES.some((prefix) => target.pathname === prefix || target.pathname.startsWith(prefix))) {
      return null;
    }
    return target.pathname + target.search + target.hash;
  } catch {
    return null;
  }
}
