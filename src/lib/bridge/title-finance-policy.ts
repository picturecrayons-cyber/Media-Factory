export type OwnerInterestInput = { ownerUserId: string; shareBps: number };
export type RevenueAllocationInput = { amountPaise: number; beneficiaryType: "OWNER" | "INVESTOR" | "BRIDGE" };

export function assertOwnerInterestShares(interests: OwnerInterestInput[]) {
  if (!interests.length) throw new Error("At least one verified title owner interest is required.");
  const seen = new Set<string>();
  let total = 0;
  for (const interest of interests) {
    if (!interest.ownerUserId || seen.has(interest.ownerUserId)) throw new Error("Owner beneficiaries must be unique and identified.");
    if (!Number.isInteger(interest.shareBps) || interest.shareBps <= 0 || interest.shareBps > 10000) throw new Error("Owner share must be between 1 and 10000 basis points.");
    seen.add(interest.ownerUserId);
    total += interest.shareBps;
  }
  if (total !== 10000) throw new Error("Verified ownership interests must total exactly 10000 basis points.");
  return total;
}

export function ownerEntitlementPaise(netRevenuePaise: number, shareBps: number) {
  if (!Number.isSafeInteger(netRevenuePaise) || netRevenuePaise < 0) throw new Error("Invalid net licensing revenue.");
  if (!Number.isInteger(shareBps) || shareBps < 0 || shareBps > 10000) throw new Error("Invalid ownership share.");
  return Math.floor(netRevenuePaise * shareBps / 10000);
}

export function assertAllocationsWithinNetRevenue(netRevenuePaise: number, allocations: RevenueAllocationInput[]) {
  if (!Number.isSafeInteger(netRevenuePaise) || netRevenuePaise < 0) throw new Error("Invalid net licensing revenue.");
  const seen = new Set<string>();
  let allocated = 0;
  for (const allocation of allocations) {
    if (!Number.isSafeInteger(allocation.amountPaise) || allocation.amountPaise <= 0) throw new Error("Allocation amounts must be positive integer paise.");
    allocated += allocation.amountPaise;
    if (!Number.isSafeInteger(allocated)) throw new Error("Allocation total exceeds supported money precision.");
  }
  if (allocated > netRevenuePaise) throw new Error("Allocations cannot exceed verified net licensing revenue.");
  return { allocatedPaise: allocated, unallocatedPaise: netRevenuePaise - allocated };
}

export function investorRemainingCap(capAmountPaise: number | null, priorApprovedOrPaidPaise: number) {
  if (capAmountPaise === null) return null;
  if (!Number.isSafeInteger(capAmountPaise) || capAmountPaise < 0 || !Number.isSafeInteger(priorApprovedOrPaidPaise) || priorApprovedOrPaidPaise < 0) throw new Error("Invalid investor cap values.");
  return Math.max(0, capAmountPaise - priorApprovedOrPaidPaise);
}

export function assertReconciliationBalanced(receiptsPaise: number, allocationsPaise: number) {
  if (!Number.isSafeInteger(receiptsPaise) || receiptsPaise < 0 || !Number.isSafeInteger(allocationsPaise) || allocationsPaise < 0) throw new Error("Invalid reconciliation totals.");
  if (allocationsPaise > receiptsPaise) throw new Error("Reconciled allocations exceed verified receipts.");
  return { unallocatedPaise: receiptsPaise - allocationsPaise, balanced: receiptsPaise === allocationsPaise };
}
