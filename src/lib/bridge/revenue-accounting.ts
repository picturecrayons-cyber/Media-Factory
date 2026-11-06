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
  return Math.max(0, reportedGrossMinor + adjustmentsMinor);
}
