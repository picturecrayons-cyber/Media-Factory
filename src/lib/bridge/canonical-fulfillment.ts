/**
 * CRA-165 canonical B2B license fulfillment contract.
 *
 * This module is deliberately adapter-driven. It does not connect to the
 * current database because CRA-128/138 have not certified an isolated schema
 * capable of persisting the organization/mandate/entitlement relations.
 *
 * A production adapter MUST implement every repository method inside one
 * database transaction. Do not wire a partial adapter or bypass this policy.
 */
export type MandateLink = {
  organizationId: string;
  status: string;
  canDelegate: boolean;
  windowStart: string | Date | null;
  windowEnd: string | Date | null;
};

export type LicenseAuthorization = {
  buyerUserId: string;
  buyerOrganizationId: string;
  membershipStatus: string;
  organizationStatus: string;
  rightsPrincipalOrganizationId: string;
  transactionBuyerOrganizationId: string;
  rightsGrantId: string;
  mandateId: string;
  mandateStatus: string;
  mandateWindowStart: string | Date | null;
  mandateWindowEnd: string | Date | null;
  mandateChain: MandateLink[];
  titleId: string;
  packageId: string | null;
  authorizationStatus: string;
  territories: string[];
  languages: string[];
  exploitationModels: string[];
  assetKinds: string[];
  rightsWindowStart: string | Date | null;
  rightsWindowEnd: string | Date | null;
  revokedAt: string | Date | null;
};

export type LicenseScopeRequest = {
  buyerUserId: string;
  buyerOrganizationId: string;
  titleId: string;
  packageId: string | null;
  territory: string;
  language: string;
  exploitationModel: string;
  assetKinds: string[];
  now?: Date;
};

export type LicenseAuthorizationDecision = {
  allow: boolean;
  reason:
    | "ALLOW"
    | "MISSING_AUTHORIZATION"
    | "BUYER_IDENTITY_MISMATCH"
    | "ORGANIZATION_INACTIVE"
    | "ORGANIZATION_SCOPE_MISMATCH"
    | "MANDATE_INVALID"
    | "MANDATE_CHAIN_INVALID"
    | "TITLE_OR_PACKAGE_MISMATCH"
    | "RIGHTS_NOT_ACTIVE"
    | "RIGHTS_SCOPE_MISMATCH"
    | "RIGHTS_WINDOW_INVALID"
    | "INVALID_REQUEST";
};

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

function parseDate(value: string | Date | null): Date | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function validWindow(
  startValue: string | Date | null,
  endValue: string | Date | null,
): { start: Date; end: Date } | null {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  return start && end && end > start ? { start, end } : null;
}

function containsWindow(
  childStartValue: string | Date | null,
  childEndValue: string | Date | null,
  parent: { start: Date; end: Date },
): boolean {
  const child = validWindow(childStartValue, childEndValue);
  return !!child && child.start >= parent.start && child.end <= parent.end;
}

/** Exact legal organization + mandate + rights decision. No email/display-name fallback. */
export function authorizeBridgeLicenseScope(
  grant: LicenseAuthorization | null | undefined,
  request: LicenseScopeRequest,
): LicenseAuthorizationDecision {
  const deny = (reason: LicenseAuthorizationDecision["reason"]): LicenseAuthorizationDecision => ({
    allow: false,
    reason,
  });

  if (!grant) return deny("MISSING_AUTHORIZATION");
  if (
    !request ||
    !nonBlank(request.buyerUserId) ||
    !nonBlank(request.buyerOrganizationId) ||
    !nonBlank(request.titleId) ||
    !nonBlank(request.territory) ||
    !nonBlank(request.language) ||
    !nonBlank(request.exploitationModel) ||
    !Array.isArray(request.assetKinds) ||
    request.assetKinds.length === 0 ||
    !request.assetKinds.every(nonBlank)
  ) return deny("INVALID_REQUEST");

  const now = request.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return deny("INVALID_REQUEST");

  if (grant.buyerUserId !== request.buyerUserId) return deny("BUYER_IDENTITY_MISMATCH");
  if (grant.membershipStatus !== "active" || grant.organizationStatus !== "active") {
    return deny("ORGANIZATION_INACTIVE");
  }
  if (
    !nonBlank(grant.buyerOrganizationId) ||
    grant.buyerOrganizationId !== request.buyerOrganizationId ||
    grant.transactionBuyerOrganizationId !== request.buyerOrganizationId
  ) return deny("ORGANIZATION_SCOPE_MISMATCH");

  if (
    !nonBlank(grant.rightsGrantId) ||
    !nonBlank(grant.mandateId) ||
    !nonBlank(grant.rightsPrincipalOrganizationId) ||
    !nonBlank(grant.mandateStatus) ||
    normalized(grant.mandateStatus) !== "ACTIVE"
  ) return deny("MANDATE_INVALID");

  const mandateWindow = validWindow(grant.mandateWindowStart, grant.mandateWindowEnd);
  if (!mandateWindow || now < mandateWindow.start || now >= mandateWindow.end) {
    return deny("MANDATE_INVALID");
  }

  const chain = grant.mandateChain;
  if (!Array.isArray(chain) || chain.length < 2) return deny("MANDATE_CHAIN_INVALID");
  const chainIds = chain.map((link) => link && nonBlank(link.organizationId) ? link.organizationId : "");
  if (
    chainIds.some((id) => !id) ||
    new Set(chainIds).size !== chainIds.length ||
    chainIds[0] !== grant.rightsPrincipalOrganizationId ||
    chainIds[chainIds.length - 1] !== request.buyerOrganizationId ||
    chain.some((link, index) =>
      !link ||
      !nonBlank(link.status) ||
      normalized(link.status) !== "ACTIVE" ||
      typeof link.canDelegate !== "boolean" ||
      (index < chain.length - 1 && link.canDelegate !== true) ||
      !containsWindow(link.windowStart, link.windowEnd, mandateWindow)
    )
  ) return deny("MANDATE_CHAIN_INVALID");

  if (grant.titleId !== request.titleId || (grant.packageId ?? null) !== (request.packageId ?? null)) {
    return deny("TITLE_OR_PACKAGE_MISMATCH");
  }
  if (
    grant.revokedAt !== null ||
    !nonBlank(grant.authorizationStatus) ||
    !["AUTHORIZED", "ACTIVE"].includes(normalized(grant.authorizationStatus))
  ) return deny("RIGHTS_NOT_ACTIVE");

  const dimensionsValid =
    Array.isArray(grant.territories) && grant.territories.length > 0 &&
    grant.territories.every(nonBlank) &&
    Array.isArray(grant.languages) && grant.languages.length > 0 &&
    grant.languages.every(nonBlank) &&
    Array.isArray(grant.exploitationModels) && grant.exploitationModels.length > 0 &&
    grant.exploitationModels.every(nonBlank) &&
    Array.isArray(grant.assetKinds) && grant.assetKinds.length > 0 &&
    grant.assetKinds.every(nonBlank);
  if (!dimensionsValid) return deny("RIGHTS_SCOPE_MISMATCH");

  const territory = normalized(request.territory);
  const language = normalized(request.language);
  const model = normalized(request.exploitationModel);
  const territoryAllowed = grant.territories.map(normalized).includes("WORLDWIDE") ||
    grant.territories.map(normalized).includes(territory);
  const languageAllowed = grant.languages.map(normalized).includes("ALL") ||
    grant.languages.map(normalized).includes(language);
  const assetsAllowed = request.assetKinds.every((kind) =>
    grant.assetKinds.map(normalized).includes(normalized(kind))
  );
  if (
    !territoryAllowed ||
    !languageAllowed ||
    !grant.exploitationModels.map(normalized).includes(model) ||
    !assetsAllowed
  ) return deny("RIGHTS_SCOPE_MISMATCH");

  const rightsWindow = validWindow(grant.rightsWindowStart, grant.rightsWindowEnd);
  if (
    !rightsWindow ||
    now < rightsWindow.start ||
    now >= rightsWindow.end ||
    !containsWindow(grant.rightsWindowStart, grant.rightsWindowEnd, mandateWindow)
  ) return deny("RIGHTS_WINDOW_INVALID");

  return { allow: true, reason: "ALLOW" };
}

export type ProviderCapture = {
  paymentId: string;
  orderId: string;
  status: string;
  amountPaise: number;
  currency: string;
};

export type CanonicalPaymentOrder = {
  id: string;
  userId: string;
  buyerOrganizationId: string;
  titleId: string;
  packageId: string | null;
  rightsGrantId: string;
  mandateId: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amountPaise: number;
  currency: string;
  status: string;
};

export type CanonicalEntitlement = {
  id: string;
  paymentRecordId: string;
  providerPaymentId: string;
  buyerUserId: string;
  buyerOrganizationId: string;
  titleId: string;
  packageId: string | null;
  rightsGrantId: string;
  mandateId: string;
  territory: string;
  language: string;
  exploitationModel: string;
  assetKinds: string[];
  startsAt: Date;
  endsAt: Date;
};

export type FulfillmentInput = {
  orderId: string;
  paymentId: string;
  actorUserId?: string | null;
  webhookEventId?: string | null;
  scope: Omit<LicenseScopeRequest, "buyerUserId" | "buyerOrganizationId" | "titleId" | "packageId">;
};

export type FulfillmentRepository<Tx> = {
  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  lockPaymentByProviderOrderId(tx: Tx, orderId: string): Promise<CanonicalPaymentOrder | null>;
  findEntitlementByProviderPaymentId(tx: Tx, paymentId: string): Promise<CanonicalEntitlement | null>;
  loadAuthorization(tx: Tx, payment: CanonicalPaymentOrder): Promise<LicenseAuthorization | null>;
  markPaymentCaptured(tx: Tx, payment: CanonicalPaymentOrder, capture: ProviderCapture): Promise<void>;
  insertEntitlement(tx: Tx, entitlement: CanonicalEntitlement): Promise<void>;
  writeFulfillmentAudit(tx: Tx, payment: CanonicalPaymentOrder, entitlement: CanonicalEntitlement): Promise<void>;
  completeWebhookEvent(tx: Tx, eventId: string, paymentId: string): Promise<void>;
};

export type CaptureVerifier = {
  /** Must fetch payment from Razorpay server-to-server; never trust browser payload fields. */
  fetchCapture(orderId: string, paymentId: string): Promise<ProviderCapture>;
};

export type FulfillmentResult =
  | { status: "fulfilled"; entitlement: CanonicalEntitlement }
  | { status: "duplicate"; entitlement: CanonicalEntitlement };

/**
 * Canonical single-writer transaction. Provider verification is server-to-server;
 * all local reads-for-update, payment transition, entitlement insert and audit
 * must share one serializable/atomic repository transaction.
 */
export async function fulfillCapturedBridgePayment<Tx>(opts: {
  input: FulfillmentInput;
  verifier: CaptureVerifier;
  repository: FulfillmentRepository<Tx>;
  createEntitlementId: () => string;
}): Promise<FulfillmentResult> {
  const { input, verifier, repository } = opts;
  if (!nonBlank(input.orderId) || !nonBlank(input.paymentId) || (input.webhookEventId != null && !nonBlank(input.webhookEventId))) {
    throw new Error("BRIDGE_FULFILLMENT_INVALID_PAYMENT_REFERENCE");
  }

  const capture = await verifier.fetchCapture(input.orderId, input.paymentId);
  if (
    capture.orderId !== input.orderId ||
    capture.paymentId !== input.paymentId ||
    !nonBlank(capture.status) ||
    normalized(capture.status) !== "CAPTURED" ||
    !Number.isSafeInteger(capture.amountPaise) ||
    capture.amountPaise <= 0 ||
    !nonBlank(capture.currency) ||
    normalized(capture.currency) !== "INR"
  ) throw new Error("BRIDGE_PROVIDER_CAPTURE_MISMATCH");

  return repository.transaction(async (tx) => {
    const payment = await repository.lockPaymentByProviderOrderId(tx, input.orderId);
    if (!payment) throw new Error("BRIDGE_PAYMENT_ORDER_NOT_FOUND");
    if (
      payment.providerOrderId !== capture.orderId ||
      !Number.isSafeInteger(payment.amountPaise) ||
      payment.amountPaise !== capture.amountPaise ||
      !nonBlank(payment.currency) ||
      normalized(payment.currency) !== normalized(capture.currency) ||
      payment.userId !== (input.actorUserId ?? payment.userId)
    ) throw new Error("BRIDGE_PAYMENT_ORDER_MISMATCH");
    if (payment.providerPaymentId && payment.providerPaymentId !== capture.paymentId) {
      throw new Error("BRIDGE_PAYMENT_ID_CONFLICT");
    }

    const prior = await repository.findEntitlementByProviderPaymentId(tx, capture.paymentId);
    if (prior) {
      if (
        prior.paymentRecordId !== payment.id ||
        prior.buyerUserId !== payment.userId ||
        prior.buyerOrganizationId !== payment.buyerOrganizationId ||
        prior.titleId !== payment.titleId ||
        (prior.packageId ?? null) !== (payment.packageId ?? null) ||
        prior.rightsGrantId !== payment.rightsGrantId ||
        prior.mandateId !== payment.mandateId
      ) throw new Error("BRIDGE_ENTITLEMENT_IDEMPOTENCY_CONFLICT");
      if (input.webhookEventId) {
        await repository.completeWebhookEvent(tx, input.webhookEventId, capture.paymentId);
      }
      return { status: "duplicate", entitlement: prior };
    }
    if (!["created", "authorized", "captured"].includes(payment.status)) {
      throw new Error("BRIDGE_PAYMENT_STATE_NOT_FULFILLABLE");
    }

    const grant = await repository.loadAuthorization(tx, payment);
    const decision = authorizeBridgeLicenseScope(grant, {
      ...input.scope,
      buyerUserId: payment.userId,
      buyerOrganizationId: payment.buyerOrganizationId,
      titleId: payment.titleId,
      packageId: payment.packageId,
    });
    if (!decision.allow) throw new Error(`BRIDGE_LICENSE_AUTHORIZATION_DENIED:${decision.reason}`);
    if (
      !grant ||
      grant.rightsGrantId !== payment.rightsGrantId ||
      grant.mandateId !== payment.mandateId
    ) throw new Error("BRIDGE_PAYMENT_AUTHORIZATION_BINDING_MISMATCH");

    const rightsWindow = validWindow(grant.rightsWindowStart, grant.rightsWindowEnd);
    if (!rightsWindow) throw new Error("BRIDGE_RIGHTS_WINDOW_INVALID");
    const entitlement: CanonicalEntitlement = {
      id: opts.createEntitlementId(),
      paymentRecordId: payment.id,
      providerPaymentId: capture.paymentId,
      buyerUserId: payment.userId,
      buyerOrganizationId: payment.buyerOrganizationId,
      titleId: payment.titleId,
      packageId: payment.packageId,
      rightsGrantId: payment.rightsGrantId,
      mandateId: payment.mandateId,
      territory: input.scope.territory,
      language: input.scope.language,
      exploitationModel: input.scope.exploitationModel,
      assetKinds: [...input.scope.assetKinds],
      startsAt: rightsWindow.start,
      endsAt: rightsWindow.end,
    };

    await repository.markPaymentCaptured(tx, payment, capture);
    await repository.insertEntitlement(tx, entitlement);
    await repository.writeFulfillmentAudit(tx, payment, entitlement);
    if (input.webhookEventId) {
      await repository.completeWebhookEvent(tx, input.webhookEventId, capture.paymentId);
    }
    return { status: "fulfilled", entitlement };
  });
}
