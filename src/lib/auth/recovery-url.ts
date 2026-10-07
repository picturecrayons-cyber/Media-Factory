import { bridgeCallbackUrl } from "../bridge/origin.ts";

export const RECOVERY_MARKER_KEY = "crayons-bridge.supabase-recovery-session";

export function getPasswordRecoveryRedirectUrl(origin?: string): string {
  const runtimeOrigin = origin || (typeof window !== "undefined" ? window.location.origin : undefined);
  return bridgeCallbackUrl(runtimeOrigin, "recovery");
}
