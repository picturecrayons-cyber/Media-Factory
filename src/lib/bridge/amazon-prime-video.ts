/**
 * Amazon Prime Video publishing domain contract.
 * Pure domain logic only: no network calls, DB writes, or implied Amazon access.
 * Unknown territory, rights, localization, or partner evidence fails closed.
 */
export type AmazonPartnerMode = "prime_video_direct" | "managed_slate";
export type AmazonOfferType = "tvod" | "svod" | "avod" | "free";
export type AmazonSubmissionState =
  | "draft" | "blocked" | "ready_for_handoff" | "handed_off" | "submitted"
  | "needs_fixes" | "accepted" | "rejected" | "delivered" | "published";

export interface AmazonTerritoryAvail {
  territoryCode: string;
  offerTypes: readonly AmazonOfferType[];
  source: "amazon_account_avails" | "verified_partner_evidence";
  evidenceReference: string;
  checkedAt: string;
  validUntil: string;
}

export interface AmazonRightsGrant {
  territoryCodes: readonly string[];
  offerTypes: readonly AmazonOfferType[];
  startsAt: string;
  endsAt: string;
  verified: boolean;
  evidenceReference: string;
  holdbackEndsAt?: string | null;
}

export interface AmazonLocalizedPackage {
  languageTag: string;
  metadataComplete: boolean;
  artworkApproved: boolean;
  captionsReady: boolean;
  audioReady: boolean;
  mezzanineReady: boolean;
}

export interface AmazonPublishingEligibilityInput {
  territoryCode: string;
  offerType: AmazonOfferType;
  now: string;
  avail: AmazonTerritoryAvail | null;
  rights: AmazonRightsGrant | null;
  localizedPackage: AmazonLocalizedPackage | null;
  requiredLanguageTag: string;
  partnerMode: AmazonPartnerMode | null;
  partnerModeVerified: boolean;
}

export interface AmazonEligibilityResult {
  eligible: boolean;
  reasons: string[];
  evidenceReferences: string[];
}

const validDate = (value: string) => Number.isFinite(Date.parse(value));

/**
 * Amazon account Avails (or explicitly verified partner evidence), verified
 * title rights, localized assets, and approved partner mode must all agree.
 */
export function evaluateAmazonPublishingEligibility(
  input: AmazonPublishingEligibilityInput,
): AmazonEligibilityResult {
  const reasons: string[] = [];
  const evidenceReferences: string[] = [];
  const nowMs = Date.parse(input.now);

  if (!Number.isFinite(nowMs)) reasons.push("INVALID_EVALUATION_TIME");
  if (!input.partnerMode || !input.partnerModeVerified) {
    reasons.push("AMAZON_PARTNER_MODE_NOT_VERIFIED");
  }

  const avail = input.avail;
  if (!avail) {
    reasons.push("TERRITORY_AVAIL_NOT_VERIFIED");
  } else {
    if (avail.territoryCode !== input.territoryCode) reasons.push("AVAIL_TERRITORY_MISMATCH");
    if (!avail.offerTypes.includes(input.offerType)) reasons.push("OFFER_TYPE_NOT_AVAILABLE");
    if (!avail.evidenceReference.trim()) reasons.push("AVAIL_EVIDENCE_REFERENCE_MISSING");
    if (!validDate(avail.checkedAt) || !validDate(avail.validUntil) ||
        Date.parse(avail.checkedAt) > nowMs || Date.parse(avail.validUntil) < nowMs) {
      reasons.push("AVAIL_EVIDENCE_STALE_OR_INVALID");
    } else if (avail.evidenceReference.trim()) {
      evidenceReferences.push(avail.evidenceReference);
    }
  }

  const rights = input.rights;
  if (!rights || !rights.verified) {
    reasons.push("RIGHTS_NOT_VERIFIED");
  } else {
    if (!rights.territoryCodes.includes(input.territoryCode)) reasons.push("RIGHTS_TERRITORY_MISMATCH");
    if (!rights.offerTypes.includes(input.offerType)) reasons.push("RIGHTS_OFFER_TYPE_MISMATCH");
    if (!validDate(rights.startsAt) || !validDate(rights.endsAt) ||
        nowMs < Date.parse(rights.startsAt) || nowMs > Date.parse(rights.endsAt)) {
      reasons.push("RIGHTS_WINDOW_INVALID_OR_EXPIRED");
    }
    if (!rights.evidenceReference.trim()) reasons.push("RIGHTS_EVIDENCE_REFERENCE_MISSING");
    else evidenceReferences.push(rights.evidenceReference);
    if (rights.holdbackEndsAt) {
      if (!validDate(rights.holdbackEndsAt)) {
        reasons.push("RIGHTS_HOLDBACK_DATE_INVALID");
      } else if (nowMs < Date.parse(rights.holdbackEndsAt)) {
        reasons.push("RIGHTS_HOLDBACK_ACTIVE");
      }
    }
  }

  const pack = input.localizedPackage;
  if (!pack) {
    reasons.push("LOCALIZED_PACKAGE_MISSING");
  } else {
    if (pack.languageTag !== input.requiredLanguageTag) reasons.push("LANGUAGE_NOT_COVERED");
    if (!pack.metadataComplete) reasons.push("LOCALIZED_METADATA_INCOMPLETE");
    if (!pack.artworkApproved) reasons.push("ARTWORK_NOT_APPROVED");
    if (!pack.captionsReady) reasons.push("CAPTIONS_NOT_READY");
    if (!pack.audioReady) reasons.push("AUDIO_NOT_READY");
    if (!pack.mezzanineReady) reasons.push("MEZZANINE_NOT_READY");
  }

  return { eligible: reasons.length === 0, reasons, evidenceReferences: [...new Set(evidenceReferences)] };
}

/** Only provider-confirmed live status maps to Published. */
export function mapAmazonProviderStatus(providerStatus: string): AmazonSubmissionState {
  switch (providerStatus.trim().toLowerCase()) {
    case "submitted":
    case "in_review": return "submitted";
    case "needs_fixes":
    case "action_required": return "needs_fixes";
    case "accepted":
    case "selected": return "accepted";
    case "rejected": return "rejected";
    case "delivered": return "delivered";
    case "published":
    case "live": return "published";
    default: return "blocked";
  }
}

/** Stable duplicate-prevention key input; persistence is implemented separately. */
export function amazonSubmissionIdempotencyKey(input: {
  titleId: string;
  titleVersionId: string;
  territoryCode: string;
  offerType: AmazonOfferType;
  languageTag: string;
}): string {
  return [
    "amazon", input.titleId.trim(), input.titleVersionId.trim(),
    input.territoryCode.trim().toUpperCase(), input.offerType,
    input.languageTag.trim().toLowerCase(),
  ].join(":");
}
