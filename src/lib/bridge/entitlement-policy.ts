export type BuyerEntitlementScope = {
  userId: string;
  organizationId: string | null;
  titleId: string;
  accessType: string;
};

export type ExpectedBuyerEntitlementScope = {
  userId: string;
  organizationId: string | null | undefined;
  titleId: string;
};

/** Buyer license grants are tenant-bound; missing organization scope is never a wildcard. */
export function matchesBuyerEntitlementScope(entitlement: BuyerEntitlementScope, expected: ExpectedBuyerEntitlementScope): boolean {
  return Boolean(
    expected.userId && expected.organizationId && expected.titleId &&
    entitlement.accessType === "license" &&
    entitlement.userId === expected.userId &&
    entitlement.organizationId === expected.organizationId &&
    entitlement.titleId === expected.titleId
  );
}