/**
 * Resolve Bridge identity only from explicit identity mappings.
 * Email similarity and raw auth subjects are never fallback identities.
 */
export function resolveBridgeUserIdFromMappings(
  authUserId: string,
  directUserIds: readonly string[],
  linkedBridgeUserIds: readonly string[],
): string {
  if (directUserIds.length > 1 || linkedBridgeUserIds.length > 1) {
    throw new Error("BRIDGE_IDENTITY_AMBIGUOUS: multiple identity mappings found");
  }
  const direct = directUserIds[0];
  const linked = linkedBridgeUserIds[0];
  if (direct && direct !== authUserId) {
    throw new Error("BRIDGE_IDENTITY_MISMATCH: direct profile does not match auth subject");
  }
  if (direct && linked && direct !== linked) {
    throw new Error("BRIDGE_IDENTITY_CONFLICT: direct and linked identities disagree");
  }
  const resolved = direct ?? linked;
  if (!resolved) throw new Error("BRIDGE_IDENTITY_UNRESOLVED: explicit Bridge identity link required");
  return resolved;
}
