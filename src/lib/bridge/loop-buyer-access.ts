/**
 * Server-side, fail-closed authorization contract for the Crayons LOOP Buyer.
 *
 * This is deliberately a pure policy module. It does not resolve identity from
 * browser metadata, create accounts, query the database, or publish titles.
 * Runtime wiring is gated on the isolated Loop STAGING schema (CRA-128/138).
 *
 * The mandate fields are an explicit domain contract, not a claim that the
 * current STAGING schema already persists this relationship.
 */
export type LoopBuyerMandateLink = {
  organizationId: string;
  status: string;
  canDelegate: boolean;
  windowStart: string | Date | null;
  windowEnd: string | Date | null;
};

export type LoopBuyerPrincipal = {
  userId: string;
  organizationId: string;
  accountType: string;
  emailVerified: boolean;
  membershipStatus: string;
  organizationStatus: string;
};

export type LoopBuyerPublicationGrant = {
  rightsGrantId: string;
  mandateId: string;
  mandateStatus: string;
  rightsPrincipalOrganizationId: string;
  buyerOrganizationId: string;
  mandateWindowStart: string | Date | null;
  mandateWindowEnd: string | Date | null;
  /** Ordered rights-principal → intermediaries → transaction buyer path. */
  mandateChain: LoopBuyerMandateLink[];
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
    | "MANDATE_REQUIRED"
    | "MANDATE_NOT_ACTIVE"
    | "MANDATE_WINDOW_REQUIRED"
    | "MANDATE_WINDOW_NOT_ACTIVE"
    | "MANDATE_CHAIN_INVALID"
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

function activeWindow(
  startValue: string | Date | null,
  endValue: string | Date | null,
  now: Date,
): "MISSING" | "INACTIVE" | "ACTIVE" {
  const start = validDate(startValue);
  const end = validDate(endValue);
  if (!start || !end || end <= start) return "MISSING";
  return now >= start && now < end ? "ACTIVE" : "INACTIVE";
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

  const now = request.now ?? new Date();
  if (!Number.isFinite(now.getTime())) return deny("MANDATE_WINDOW_NOT_ACTIVE");

  if (!grant.rightsGrantId?.trim() || !grant.mandateId?.trim()) {
    return deny("MANDATE_REQUIRED");
  }
  if (normalized(grant.mandateStatus) !== "ACTIVE") {
    return deny("MANDATE_NOT_ACTIVE");
  }
  if (
    !grant.rightsPrincipalOrganizationId?.trim() ||
    grant.buyerOrganizationId !== principal.organizationId
  ) {
    return deny("ORGANIZATION_SCOPE_MISMATCH");
  }

  const mandateWindow = activeWindow(grant.mandateWindowStart, grant.mandateWindowEnd, now);
  if (mandateWindow === "MISSING") return deny("MANDATE_WINDOW_REQUIRED");
  if (mandateWindow === "INACTIVE") return deny("MANDATE_WINDOW_NOT_ACTIVE");

  const chain = grant.mandateChain;
  if (!Array.isArray(chain) || chain.length < 2) return deny("MANDATE_CHAIN_INVALID");
  const chainIds = chain.map((link) => link.organizationId);
  if (
    chainIds.some((id) => !id?.trim()) ||
    new Set(chainIds).size !== chainIds.length ||
    chainIds[0] !== grant.rightsPrincipalOrganizationId ||
    chainIds[chainIds.length - 1] !== grant.buyerOrganizationId ||
    chain.some((link, index) =>
      normalized(link.status) !== "ACTIVE" ||
      activeWindow(link.windowStart, link.windowEnd, now) !== "ACTIVE" ||
      (index < chain.length - 1 && !link.canDelegate)
    )
  ) {
    return deny("MANDATE_CHAIN_INVALID");
  }

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

  const rightsWindow = activeWindow(grant.windowStart, grant.windowEnd, now);
  if (rightsWindow === "MISSING") return deny("EXPLICIT_RIGHTS_WINDOW_REQUIRED");
  if (rightsWindow === "INACTIVE") return deny("RIGHTS_WINDOW_NOT_ACTIVE");

  return { allow: true, reason: "ALLOW" };
}
