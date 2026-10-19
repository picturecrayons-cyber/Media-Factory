const INTERNAL_ORIGIN = "https://bridge.invalid";

/**
 * Accept only same-origin absolute paths. Backslashes are rejected because URL
 * parsers may normalize them as slashes and turn a path into a network-path URL.
 */
export function isSafeInternalRedirect(path: string | null | undefined): path is string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return false;
  }

  try {
    const parsed = new URL(path, INTERNAL_ORIGIN);
    return parsed.origin === INTERNAL_ORIGIN && !path.includes("://");
  } catch {
    return false;
  }
}
