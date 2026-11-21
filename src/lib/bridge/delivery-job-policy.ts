export type DeliveryReadiness = {
  submissionType: string | null | undefined;
  qcPassedForCurrentAssets: boolean;
  legalApproved: boolean;
  rightsGrantValid: boolean;
  packagingComplete: boolean;
  finalDeliveryGateReady: boolean;
  lifecycleReady: boolean;
};

export function isFinishedFilmSubmission(value: string | null | undefined): boolean {
  return value === "finished_film";
}

export function canRequestVendorJob(input: {
  submissionType: string | null | undefined;
  actorCanReadTitle: boolean;
  actorCanManageDelivery: boolean;
  accountType: string;
}): boolean {
  if (!isFinishedFilmSubmission(input.submissionType)) return false;
  if (input.actorCanManageDelivery) return true;
  return input.actorCanReadTitle &&
    (input.accountType === "independent_creator" || input.accountType === "studio");
}

export function deliveryFinalGate(readiness: DeliveryReadiness): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!isFinishedFilmSubmission(readiness.submissionType)) reasons.push("Only finished-film submissions can be delivered.");
  if (!readiness.lifecycleReady) reasons.push("The title lifecycle has not reached delivery review.");
  if (!readiness.qcPassedForCurrentAssets) reasons.push("QC approval for the current master and artwork is required.");
  if (!readiness.legalApproved) reasons.push("Independent Legal approval is required.");
  if (!readiness.rightsGrantValid) reasons.push("A currently valid rights grant is required.");
  if (!readiness.packagingComplete) reasons.push("Packaging must be certified COMPLETE.");
  if (!readiness.finalDeliveryGateReady) reasons.push("The final Bridge delivery gate must be READY.");
  return { ready: reasons.length === 0, reasons };
}

export function isValidVendorReceiptKey(key: string, jobId: string): boolean {
  return key.startsWith(`bridge-private/vendor-delivery-receipts/${jobId}/`) &&
    !key.includes("..") && !key.startsWith("/") && key.length <= 1024;
}

export function isValidSha256Receipt(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}
