export type BuyerPackageState = {
  status: string;
  buyerUserId: string | null;
};

/** A package under negotiation is private to the buyer who reserved it. */
export function canBuyerAccessLicensePackage(
  pkg: BuyerPackageState,
  buyerUserId: string,
): boolean {
  if (!buyerUserId.trim()) return false;
  if (pkg.status === "READY") return pkg.buyerUserId === null;
  return pkg.status === "IN_NEGOTIATION" && pkg.buyerUserId === buyerUserId;
}

/** Buyer package listings expose only unclaimed offers or packages reserved by this buyer. */
export function canBuyerViewLicensePackage(
  pkg: BuyerPackageState,
  buyerUserId: string,
): boolean {
  if (!buyerUserId.trim()) return false;
  if (pkg.status === "READY") return pkg.buyerUserId === null;
  return (
    (pkg.status === "IN_NEGOTIATION" || pkg.status === "LICENSED") &&
    pkg.buyerUserId === buyerUserId
  );
}
