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

/**
 * Internal-role invitations require a durable two-person approval record.
 * Until that workflow and its schema exist, no single-actor invite may be sent.
 */
export function assertInternalRoleGrantBlocked(): never {
  throw new Error(
    "BRIDGE_INTERNAL_ROLE_GRANT_BLOCKED: dual-control approval workflow is not implemented",
  );
}
