export const BRIDGE_CANONICAL_ORIGIN = "https://www.crayonspictures.in";

const RETIRED_SUFFIX = ".streamvista.in";

export function normalizeBridgeOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(candidate).origin;
  } catch {
    return undefined;
  }
}

export function isRetiredBridgeOrigin(value: string | undefined): boolean {
  const origin = normalizeBridgeOrigin(value);
  if (!origin) return false;
  const host = new URL(origin).hostname.toLowerCase();
  return host === "streamvista.in" || host.endsWith(RETIRED_SUFFIX);
}

export function resolveBridgeCanonicalOrigin(
  configured: string | undefined,
  fallback = BRIDGE_CANONICAL_ORIGIN,
): string {
  const origin = normalizeBridgeOrigin(configured);
  if (!origin || isRetiredBridgeOrigin(origin)) return fallback;
  return origin;
}
