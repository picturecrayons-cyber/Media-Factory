/**
 * CRA-165 fail-closed authorization boundaries.
 *
 * These guards intentionally deny unsupported authorization paths. They are
 * not substitutes for the future organization/mandate/rights authorization
 * model; they prevent a partial identity or organization signal from granting
 * access while that model is absent.
 */
export type BuyerOrderActor = {
  userId: string;
  accountType: string;
  organizationId?: string | null;
};

export function assertBuyerLicenseOrderBlocked(actor: BuyerOrderActor): void {
  if (actor.accountType === "buyer") {
    throw new Error(
      "BRIDGE_LICENSE_ORDER_BLOCKED: canonical organization, mandate, and exact-rights authorization is not implemented",
    );
  }
}

export function requireDirectBridgeIdentity(
  authUserId: string,
  directProfileUserId: string | null | undefined,
): string {
  if (directProfileUserId && directProfileUserId === authUserId) {
    return directProfileUserId;
  }
  throw new Error(
    "BRIDGE_IDENTITY_UNRESOLVED: direct immutable auth subject required; legacy link revocation is not representable",
  );
}
