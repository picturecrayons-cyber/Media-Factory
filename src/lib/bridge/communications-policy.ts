export type BuyerInternalRole = "admin" | "super_admin" | string;
export type BuyerPipelineStage =
  | "DISCOVERED" | "RESEARCHING" | "CONTACT_READY" | "ENQUIRY"
  | "IN_NEGOTIATION" | "CONTRACT_REVIEW" | "CONTRACTED" | "DECLINED" | "DORMANT";

const ALLOWED_STAGE_TRANSITIONS: Record<BuyerPipelineStage, readonly BuyerPipelineStage[]> = {
  DISCOVERED: ["RESEARCHING", "CONTACT_READY", "DECLINED"],
  RESEARCHING: ["CONTACT_READY", "ENQUIRY", "DECLINED"],
  CONTACT_READY: ["ENQUIRY", "IN_NEGOTIATION", "DECLINED"],
  ENQUIRY: ["IN_NEGOTIATION", "DECLINED", "DORMANT"],
  IN_NEGOTIATION: ["CONTRACT_REVIEW", "DECLINED", "DORMANT"],
  CONTRACT_REVIEW: ["IN_NEGOTIATION", "CONTRACTED", "DECLINED"],
  CONTRACTED: [],
  DECLINED: ["RESEARCHING"],
  DORMANT: ["RESEARCHING"],
};

export function canAccessBuyerProspect(
  role: BuyerInternalRole,
  actorOrganization: string | null | undefined,
  recordOrganization: string | null | undefined,
): boolean {
  if (role === "super_admin") return true;
  return role === "admin" && Boolean(actorOrganization?.trim()) &&
    Boolean(recordOrganization?.trim()) && actorOrganization === recordOrganization;
}

export function canAdvanceBuyerProspectStage(from: string, to: BuyerPipelineStage): boolean {
  return (ALLOWED_STAGE_TRANSITIONS[from as BuyerPipelineStage] ?? []).includes(to);
}

export function buyerStageNotificationDedupeKey(
  prospectId: string,
  from: BuyerPipelineStage,
  to: BuyerPipelineStage,
): string {
  return `buyer-stage:${prospectId}:${from}:${to}`;
}

export function recipientsMatchProspectContact(recipients: readonly string[], contactEmail: string | null | undefined): boolean {
  const normalized = contactEmail?.trim().toLowerCase();
  return Boolean(normalized && recipients.length > 0 &&
    recipients.every((recipient) => recipient.trim().toLowerCase() === normalized));
}
