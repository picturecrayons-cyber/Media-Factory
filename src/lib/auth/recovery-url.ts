export const RECOVERY_MARKER_KEY = "crayons-bridge.supabase-recovery-session";

export function getPasswordRecoveryRedirectUrl(origin?: string): string {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "https://bridge.crayonspictures.com");
  return `${base}/auth/callback?type=recovery`;
}
