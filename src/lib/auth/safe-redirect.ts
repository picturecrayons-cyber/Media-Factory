/**
 * Accept only same-origin relative destinations for post-auth navigation.
 * Reject protocol-relative paths, backslashes (which URL parsers normalize),
 * and control characters before parsing.
 */
export function isSafeInternalRedirect(value: string | null): value is string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return false;
  }

  try {
    const target = new URL(value, "https://bridge.invalid");
    return target.origin === "https://bridge.invalid";
  } catch {
    return false;
  }
}
