/**
 * Resolve a Supabase Auth identity through an explicit legacy Bridge link.
 * Direct same-ID profiles are handled first by resolveBridgeUserId.
 * Email similarity is deliberately not an identity-binding mechanism.
 */
export function selectBridgeUserId(
  authUserId: string,
  linkedBridgeUserId: string | null,
): string {
  return linkedBridgeUserId ?? authUserId;
}
