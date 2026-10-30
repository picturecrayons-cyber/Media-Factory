/**
 * Resolve a verified Supabase Auth identity to its Bridge profile ID.
 *
 * A direct same-ID profile or an explicit identity link is required.
 * Email similarity is deliberately not an identity-binding mechanism.
 */
export function selectBridgeUserId(
  authUserId: string,
  directProfileUserId: string | null,
  linkedBridgeUserId: string | null,
): string {
  if (
    directProfileUserId &&
    linkedBridgeUserId &&
    directProfileUserId !== linkedBridgeUserId
  ) {
    throw new Error("Conflicting Bridge identity bindings");
  }

  return directProfileUserId ?? linkedBridgeUserId ?? authUserId;
}
