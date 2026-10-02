import { BRIDGE_CANONICAL_ORIGIN, resolveBridgeCanonicalOrigin } from "../bridge/origin.ts";

export const RECOVERY_MARKER_KEY = "crayons-bridge.supabase-recovery-session";

export function getPasswordRecoveryRedirectUrl(origin?: string): string {
  const runtimeOrigin = origin || (typeof window !== "undefined" ? window.location.origin : undefined);
  const base = resolveBridgeCanonicalOrigin(runtimeOrigin, BRIDGE_CANONICAL_ORIGIN);
  return `${base}/auth/callback?type=recovery`;
}
