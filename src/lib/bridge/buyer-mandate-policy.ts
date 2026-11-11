/**
 * Pure, fail-closed authorization policy for platform-buyer film acquisition.
 * Keep this module free of database and provider calls so its rules are testable.
 * Callers must resolve organization, membership, mandate and title rights server-side.
 */
export type BuyerMandate = {
  status: "pending_review" | "verified" | "rejected" | "suspended" | "expired" | "revoked";
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  channels: readonly string[];
  territories: readonly string[];
  languages: readonly string[];
  mediaRights: readonly string[];
  exploitationModels: readonly string[];
  exclusivity: "exclusive" | "non_exclusive";
  sublicensingAllowed: boolean;
  onwardDelegationAllowed: boolean;
};

export type BuyerOrganization = {
  kind: "studio" | "buyer" | "platform_buyer" | "distributor" | "aggregator";
  verificationStatus: "unverified" | "pending_review" | "verified" | "rejected" | "suspended";
};

export type AcquisitionRights = {
  channel: string;
  territory: string;
  language: string;
  mediaRight: string;
  exploitationModel: string;
  exclusive: boolean;
  requiresSublicensing: boolean;
  requiresOnwardDelegation: boolean;
  startsAt: string;
  endsAt: string | null;
};

export type BuyerAuthorization =
  | { allowed: true }
  | { allowed: false; reason: string };

function includesExact(values: readonly string[], value: string): boolean {
  return values.some((entry) => entry.trim().toLowerCase() === value.trim().toLowerCase());
}

/** No missing organization, mandate, scope or date may be interpreted as permission. */
export function authorizePlatformBuyerAcquisition(input: {
  organization: BuyerOrganization | null;
  mandate: BuyerMandate | null;
  rights: AcquisitionRights;
  now?: Date;
}): BuyerAuthorization {
  const { organization, mandate, rights } = input;
  const now = input.now ?? new Date();

  if (!organization || organization.verificationStatus !== "verified") {
    return { allowed: false, reason: "BUYER_ORGANIZATION_NOT_VERIFIED" };
  }
  if (!["buyer", "platform_buyer", "distributor", "aggregator"].includes(organization.kind)) {
    return { allowed: false, reason: "ORGANIZATION_KIND_NOT_AUTHORIZED" };
  }
  if (!mandate || mandate.status !== "verified") {
    return { allowed: false, reason: "ACTIVE_VERIFIED_MANDATE_REQUIRED" };
  }

  const start = mandate.effectiveFrom ? new Date(mandate.effectiveFrom) : null;
  const end = mandate.effectiveUntil ? new Date(mandate.effectiveUntil) : null;
  if (start && (!Number.isFinite(start.getTime()) || now < start)) {
    return { allowed: false, reason: "MANDATE_NOT_YET_EFFECTIVE" };
  }
  if (end && (!Number.isFinite(end.getTime()) || now >= end)) {
    return { allowed: false, reason: "MANDATE_EXPIRED" };
  }
  if (!includesExact(mandate.channels, rights.channel)) {
    return { allowed: false, reason: "CHANNEL_OUT_OF_MANDATE_SCOPE" };
  }
  if (!includesExact(mandate.territories, rights.territory)) {
    return { allowed: false, reason: "TERRITORY_OUT_OF_MANDATE_SCOPE" };
  }
  if (!includesExact(mandate.languages, rights.language)) {
    return { allowed: false, reason: "LANGUAGE_OUT_OF_MANDATE_SCOPE" };
  }
  if (!includesExact(mandate.mediaRights, rights.mediaRight)) {
    return { allowed: false, reason: "MEDIA_RIGHT_OUT_OF_MANDATE_SCOPE" };
  }
  if (!includesExact(mandate.exploitationModels, rights.exploitationModel)) {
    return { allowed: false, reason: "EXPLOITATION_MODEL_OUT_OF_MANDATE_SCOPE" };
  }
  if (rights.exclusive && mandate.exclusivity !== "exclusive") {
    return { allowed: false, reason: "EXCLUSIVITY_NOT_AUTHORIZED" };
  }
  if (rights.requiresSublicensing && !mandate.sublicensingAllowed) {
    return { allowed: false, reason: "SUBLICENSING_NOT_AUTHORIZED" };
  }
  if (rights.requiresOnwardDelegation && !mandate.onwardDelegationAllowed) {
    return { allowed: false, reason: "ONWARD_DELEGATION_NOT_AUTHORIZED" };
  }

  const requestedStart = new Date(rights.startsAt);
  const requestedEnd = rights.endsAt ? new Date(rights.endsAt) : null;
  if (!Number.isFinite(requestedStart.getTime()) || (requestedEnd && !Number.isFinite(requestedEnd.getTime()))) {
    return { allowed: false, reason: "RIGHTS_WINDOW_INVALID" };
  }
  if (start && requestedStart < start) {
    return { allowed: false, reason: "RIGHTS_WINDOW_BEFORE_MANDATE" };
  }
  if (end && (!requestedEnd || requestedEnd > end)) {
    return { allowed: false, reason: "RIGHTS_WINDOW_EXCEEDS_MANDATE" };
  }
  if (requestedEnd && requestedEnd <= requestedStart) {
    return { allowed: false, reason: "RIGHTS_WINDOW_INVALID" };
  }
  return { allowed: true };
}
