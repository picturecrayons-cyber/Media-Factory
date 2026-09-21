import type { TitleStatus } from "./types.ts";
import { TITLE_STATUS_ORDER } from "./lifecycle.ts";

export type QcDecision = "pass" | "fail" | "request_changes" | null;

export type RightsSnapshot = {
  approvedAt: string | null;
  chainOfTitleStatus: string;
  endDate: string | null;
  territories: string;
  rightsType: string;
  mediaType: string;
  evidenceNote: string;
};

export function computeBlockers(input: {
  status: TitleStatus;
  masterKey: string | null;
  latestQc: QcDecision;
  rights: RightsSnapshot | null;
  capturedLicense: boolean;
  hasDelivery?: boolean;
}): string[] {
  const blockers: string[] = [];
  const liveIdx = TITLE_STATUS_ORDER.indexOf("LIVE_FOR_BUYERS");
  const statusIdx = TITLE_STATUS_ORDER.indexOf(input.status);

  if (statusIdx < liveIdx) blockers.push("Not live for buyers");
  if (!input.masterKey) blockers.push("Required asset missing");
  if (input.status === "QC_REVIEW" && input.latestQc !== "pass") {
    if (input.latestQc === "fail") blockers.push("QC failed");
    else if (input.latestQc === "request_changes") blockers.push("QC requested changes");
    else blockers.push("QC review pending");
  }
  if (statusIdx < TITLE_STATUS_ORDER.indexOf("QC_REVIEW")) blockers.push("QC review pending");
  if (input.status === "RIGHTS_REVIEW") blockers.push("Rights review pending");
  if (statusIdx < TITLE_STATUS_ORDER.indexOf("RIGHTS_REVIEW") && statusIdx >= 0) {
    if (!blockers.includes("QC review pending") && input.status !== "QC_REVIEW") {
      blockers.push("Rights review pending");
    }
  }
  if (input.rights?.endDate && new Date(input.rights.endDate) < new Date()) {
    blockers.push("Rights expired");
  }
  if (input.status === "IN_NEGOTIATION" && !input.capturedLicense) {
    blockers.push("Payment not captured");
  }
  if (input.status === "LICENSED" && !input.hasDelivery) blockers.push("Delivery package unavailable");
  return [...new Set(blockers)];
}

export function rightsAreEvidenced(rights: RightsSnapshot | null): boolean {
  if (!rights) return false;
  if (rights.chainOfTitleStatus === "unverified") return false;
  if (!rights.territories.trim() || !rights.rightsType.trim() || !rights.mediaType.trim()) return false;
  if (!rights.evidenceNote.trim()) return false;
  return true;
}
