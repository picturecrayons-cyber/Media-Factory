/**
 * Read-only reconciliation of Supabase Auth identities to existing Bridge profiles.
 *
 * This module deliberately does not use signup metadata or email equality to
 * attach identities. A cross-ID match requires an explicit identity-link row;
 * email-only matches are returned for manual review. It performs no writes.
 */

export type ReconciliationAuthIdentity = {
  authUserId: string;
  email: string | null;
  emailVerified: boolean;
};

export type ReconciliationBridgeProfile = {
  bridgeUserId: string;
  email: string | null;
  accountType: string;
  internalRole: string | null;
};

export type ReconciliationIdentityLink = {
  authUserId: string;
  bridgeUserId: string;
};

export type ReconciliationStatus =
  | "direct_profile_match"
  | "explicit_identity_link"
  | "manual_review_email_match"
  | "manual_review_conflicting_links"
  | "onboarding_required";

export type AccountReconciliationResult = {
  authUserId: string;
  status: ReconciliationStatus;
  bridgeUserId: string | null;
  reason: string;
};

/**
 * Produces a review report only. Callers must not interpret this result as
 * permission to create profiles, change roles, or mutate identity links.
 */
export function reconcileAccountIdentities(input: {
  authIdentities: ReconciliationAuthIdentity[];
  bridgeProfiles: ReconciliationBridgeProfile[];
  identityLinks: ReconciliationIdentityLink[];
}): AccountReconciliationResult[] {
  const profilesById = new Map<string, ReconciliationBridgeProfile[]>();
  const profilesByEmail = new Map<string, ReconciliationBridgeProfile[]>();
  for (const profile of input.bridgeProfiles) {
    profilesById.set(profile.bridgeUserId, [
      ...(profilesById.get(profile.bridgeUserId) ?? []),
      profile,
    ]);
    if (profile.email) {
      const email = profile.email.trim().toLowerCase();
      profilesByEmail.set(email, [...(profilesByEmail.get(email) ?? []), profile]);
    }
  }

  return input.authIdentities.map((identity) => {
    const direct = profilesById.get(identity.authUserId) ?? [];
    const links = input.identityLinks.filter((link) => link.authUserId === identity.authUserId);
    const linkedProfiles = links.flatMap((link) => profilesById.get(link.bridgeUserId) ?? []);

    if (direct.length > 1 || links.length > 1 || (direct.length && links.length && linkedProfiles[0]?.bridgeUserId !== identity.authUserId)) {
      return {
        authUserId: identity.authUserId,
        status: "manual_review_conflicting_links",
        bridgeUserId: null,
        reason: "Multiple or conflicting profile/identity-link records require manual review.",
      };
    }

    if (direct.length === 1) {
      return {
        authUserId: identity.authUserId,
        status: "direct_profile_match",
        bridgeUserId: direct[0].bridgeUserId,
        reason: "Auth user ID directly matches the existing Bridge profile ID.",
      };
    }

    if (links.length === 1) {
      if (linkedProfiles.length !== 1) {
        return {
          authUserId: identity.authUserId,
          status: "manual_review_conflicting_links",
          bridgeUserId: null,
          reason: "The explicit identity link does not resolve to exactly one existing Bridge profile.",
        };
      }
      return {
        authUserId: identity.authUserId,
        status: "explicit_identity_link",
        bridgeUserId: linkedProfiles[0].bridgeUserId,
        reason: "A single explicit identity-link record resolves this Auth identity to an existing Bridge profile.",
      };
    }

    const emailMatches = identity.email
      ? profilesByEmail.get(identity.email.trim().toLowerCase()) ?? []
      : [];
    if (emailMatches.length) {
      return {
        authUserId: identity.authUserId,
        status: "manual_review_email_match",
        bridgeUserId: null,
        reason: "Email equality alone is not sufficient to adopt an existing profile or grant its role.",
      };
    }

    return {
      authUserId: identity.authUserId,
      status: "onboarding_required",
      bridgeUserId: null,
      reason: "No direct profile or explicit identity link exists; signup metadata is not an identity authority.",
    };
  });
}
