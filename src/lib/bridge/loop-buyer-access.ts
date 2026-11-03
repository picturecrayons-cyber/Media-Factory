/**
 * Server-side, fail-closed authorization contract for the Crayons LOOP Buyer.
 *
 * This is deliberately a pure policy module. It does not resolve identity from
 * browser metadata, create accounts, query the database, or publish titles.
 * Runtime wiring is gated on the isolated Loop STAGING schema (CRA-128/138).
 */
export type LoopBuyerPrincipal = {
  userId: string;
  organizationId: string;
  accountType: string;
  emailVerified: boolean;
  membershipStatus: string;
  organizationStatus: string;
};

export type LoopBuyerPublicationGrant = {
  buyerOrganizationId: string;
  titleId: string;
  authorizationStatus: string;
  territories: string[];
  languages: string[];
  exploitationModels: string[];
  windowStart: string | Date | null;
  windowEnd: string | Date | null;
  revokedAt: string | Date | null;
};

export type LoopBuyerRequest = {
  titleId: string;
  territory: string;
  language: string;
  exploitationModel: string;
  now?: Date;
};

export type LoopBuyerDecision = {
  allow: boolean;
  reason:
    | "ALLOW"
    | "INVALID_PRINCIPAL"
    | "BUYER_IDENTITY_REQUIRED"
    | "ACTIVE_MEMBERSHIP_REQUIRED"
    | "ACTIVE_ORGANIZATION_REQUIRED"
    | "PUBLICATION_NOT_FOUND"
    | "ORGANIZATION_SCOPE_MISMATCH"
    | "TITLE_SCOPE_MISMATCH"
    | "PUBLICATION_NOT_ACTIVE"
    | "PUBLICATION_REVOKED"
    | "RIGHTS_DIMENSION_MISMATCH"
    | "EXPLICIT_RIGHTS_WINDOW_REQUIRED"
    | "RIGHTS_WINDOW_NOT_ACTIVE";
};

function normalized(value: string) {
  return value.trim().toUpperCase();
}

function validDate(value: string | Date | null): Date | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function authorizeLoopBuyerTitle(
  principal: LoopBuyerPrincipal | null | undefined,
  grant: LoopBuyerPublicationGrant | null | undefined,
  request: LoopBuyerRequest,
): LoopBuyerDecision {
  const deny = (reason: LoopBuyerDecision["reason"]): LoopBuyerDecision => ({ allow: false, reason });

  if (!principal || !principal.userId.trim() || !principal.organizationId.trim()) {
    return deny("INVALID_PRINCIPAL");
  }
  if (principal.accountType !== "buyer" || !principal.emailVerified) {
    return deny("BUYER_IDENTITY_REQUIRED");
  }
  if (principal.membershipStatus !== "active") {
    return deny("ACTIVE_MEMBERSHIP_REQUIRED");
  }
  if (principal.organizationStatus !== "active") {
    return deny("ACTIVE_ORGANIZATION_REQUIRED");
  }
  if (!grant) return deny("PUBLICATION_NOT_FOUND");
  if (grant.buyerOrganizationId !== principal.organizationId) {
    return deny("ORGANIZATION_SCOPE_MISMATCH");
  }
  if (grant.titleId !== request.titleId) return deny("TITLE_SCOPE_MISMATCH");
  if (grant.revokedAt) return deny("PUBLICATION_REVOKED");
  if (!["AUTHORIZED", "LIVE"].includes(normalized(grant.authorizationStatus))) {
    return deny("PUBLICATION_NOT_ACTIVE");
  }

  const territory = normalized(request.territory);
  const language = normalized(request.language);
  const model = normalized(request.exploitationModel);
  const territories = grant.territories.map(normalized);
  const languages = grant.languages.map(normalized);
  const models = grant.exploitationModels.map(normalized);
  const territoryAllowed = territories.includes(territory) ||
    (territories.includes("WORLDWIDE") && territory.length > 0);
  const languageAllowed = languages.includes(language) ||
    (languages.includes("ALL") && language.length > 0);
  if (!territoryAllowed || !languageAllowed || !models.includes(model)) {
    return deny("RIGHTS_DIMENSION_MISMATCH");
  }

  const start = validDate(grant.windowStart);
  const end = validDate(grant.windowEnd);
  if (!start || !end || end <= start) return deny("EXPLICIT_RIGHTS_WINDOW_REQUIRED");
  const now = request.now ?? new Date();
  if (!Number.isFinite(now.getTime()) || now < start || now >= end) {
    return deny("RIGHTS_WINDOW_NOT_ACTIVE");
  }

  return { allow: true, reason: "ALLOW" };
}
