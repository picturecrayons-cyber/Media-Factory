/** Estimates are never promoted to reported earnings without a channel statement. */
export function computeReportedNetMinor(
  reportedGrossMinor: number | null | undefined,
  adjustmentsMinor: number,
): number | null {
  if (reportedGrossMinor == null) return null;
  if (!Number.isSafeInteger(reportedGrossMinor) || reportedGrossMinor < 0) {
    throw new Error("Reported gross amount must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(adjustmentsMinor)) {
    throw new Error("Adjustments must be a safe integer");
  }
  const net = Math.max(0, reportedGrossMinor + adjustmentsMinor);
  if (!Number.isSafeInteger(net)) {
    throw new Error("Reported net amount exceeds the safe minor-unit range");
  }
  return net;
}

/** This release records a full channel settlement, not partial instalments. */
export function assertFullSettlementAmount(paidAmountMinor: number, netAmountMinor: number | null): void {
  if (!Number.isSafeInteger(paidAmountMinor) || paidAmountMinor <= 0) {
    throw new Error("Paid amount must be a positive safe minor-unit integer");
  }
  if (netAmountMinor == null || !Number.isSafeInteger(netAmountMinor) || netAmountMinor <= 0) {
    throw new Error("A positive reconciled net amount is required before recording payment");
  }
  if (paidAmountMinor !== netAmountMinor) {
    throw new Error("Recorded payment must equal the reconciled net amount; partial settlements are not supported");
  }
}
