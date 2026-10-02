export const BRIDGE_CANONICAL_ORIGIN = "https://www.crayonspictures.in";

const RETIRED_SUFFIX = ".streamvista.in";
const APPROVED_PRODUCTION_HOSTS = new Set(["www.crayonspictures.in"]);
const APPROVED_PREVIEW_HOST_SUFFIX = ".vercel.app";

export function normalizeBridgeOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return undefined;
    return url.origin;
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

export function isApprovedBridgeOrigin(value: string | undefined): boolean {
  const origin = normalizeBridgeOrigin(value);
  if (!origin || isRetiredBridgeOrigin(origin)) return false;
  const host = new URL(origin).hostname.toLowerCase();
  return APPROVED_PRODUCTION_HOSTS.has(host) || (host.startsWith("bridge-") && host.endsWith(APPROVED_PREVIEW_HOST_SUFFIX));
}

export function resolveBridgeCanonicalOrigin(
  configured: string | undefined,
  fallback = BRIDGE_CANONICAL_ORIGIN,
): string {
  const origin = normalizeBridgeOrigin(configured);
  if (!origin || !isApprovedBridgeOrigin(origin)) return fallback;
  return origin;
}

export function resolveBridgeConfiguredOrigin(
  appUrl: string | undefined,
  siteUrl: string | undefined,
): string {
  return resolveBridgeCanonicalOrigin(appUrl || siteUrl, BRIDGE_CANONICAL_ORIGIN);
}

export function bridgeCallbackUrl(origin: string | undefined, type?: "recovery"): string {
  const base = resolveBridgeCanonicalOrigin(origin, BRIDGE_CANONICAL_ORIGIN);
  return `${base}/auth/callback${type ? `?type=${type}` : ""}`;
}

export function bridgeVerificationUrl(token: string, origin?: string): string {
  return `${resolveBridgeCanonicalOrigin(origin, BRIDGE_CANONICAL_ORIGIN)}/verify-email?token=${encodeURIComponent(token)}`;
}

export function bridgeInvitationUrl(token: string, origin?: string): string {
  return `${resolveBridgeCanonicalOrigin(origin, BRIDGE_CANONICAL_ORIGIN)}/signup?invite=${encodeURIComponent(token)}`;
}
