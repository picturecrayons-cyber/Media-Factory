/**
 * Safe identity resolution policy for Bridge auth/profile mapping.
 * Email is deliberately not an input: matching email is not proof that an
 * OAuth identity owns a pre-existing Bridge profile.
 */
export function resolveExplicitBridgeProfileId(input: {
  authUserId: string;
  directProfileId?: string | null;
  linkedProfileId?: string | null;
}): string | null {
  if (input.directProfileId === input.authUserId) return input.authUserId;
  if (input.linkedProfileId) return input.linkedProfileId;
  return null;
}

/** Google identities may not be resolved to a legacy profile by email alone. */
export function canUseLegacyEmailFallback(hasGoogleIdentity: boolean): boolean {
  return !hasGoogleIdentity;
}
