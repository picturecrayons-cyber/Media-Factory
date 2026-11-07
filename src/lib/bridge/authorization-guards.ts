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
};

export function assertBuyerLicenseOrderBlocked(actor: BuyerOrderActor): void {
  if (actor.accountType === "buyer") {
    throw new Error(
      "BRIDGE_LICENSE_ORDER_BLOCKED: canonical organization, mandate, and exact-rights authorization is not implemented",
    );
  }
}
