const INTERNAL_ORIGIN = "https://crayons-bridge.invalid";

/**
 * Return a same-origin path for post-auth navigation, or null for unsafe input.
 * URL parsing also normalizes backslashes, preventing browser URL parser
 * differences from turning a slash-prefixed value into an external redirect.
 */
export function getSafeInternalRedirect(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;

  try {
    const target = new URL(value, INTERNAL_ORIGIN);
    if (target.origin !== INTERNAL_ORIGIN) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}
