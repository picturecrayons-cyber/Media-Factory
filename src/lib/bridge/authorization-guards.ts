/**
 * CRA-165 fail-closed authorization boundaries.
 *
 * Buyer license orders remain disabled until canonical organization, mandate,
 * and exact-rights authorization are enforced by the same server transaction.
 */
export type BuyerOrderActor = {
  userId: string;
  accountType: string;
  organizationId?: string | null;
  internalRole?: string | null;
};

export function assertBuyerLicenseOrderBlocked(actor: BuyerOrderActor): void {
  if (actor.accountType === "buyer") {
    throw new Error(
      "BRIDGE_LICENSE_ORDER_BLOCKED: canonical organization, mandate, and exact-rights authorization is not implemented",
    );
  }
}

/**
 * Legacy user/title entitlements do not carry legal Buyer organization,
 * mandate, rights-scope, term, or revocation bindings. They must not mint
 * Buyer download URLs until the canonical delivery authorization exists.
 */
export function assertBuyerDeliveryBlocked(actor: BuyerOrderActor): void {
  if (actor.accountType === "buyer" && !actor.internalRole) {
    throw new Error(
      "BRIDGE_BUYER_DELIVERY_BLOCKED: organization, mandate, exact-rights, and revocation authorization is not implemented",
    );
  }
}
