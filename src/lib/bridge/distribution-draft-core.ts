export type DistributionDraftInput = {
  buyerName: string;
  titleName?: string | null;
  inquiryText: string;
};

export type DistributionDraft = {
  subject: string;
  body: string;
  status: "DRAFT_PENDING_OPERATOR_APPROVAL";
  claimsAvailability: false;
  outboundAction: "NONE";
};

function clean(value: string | null | undefined, max: number): string {
  // Control characters are removed from untrusted text before it is used in a draft.
  // eslint-disable-next-line no-control-regex
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Safe first-response draft. Incoming email is untrusted data, never instructions.
 * It deliberately makes no availability, pricing, territory, rights or screener claims.
 * Inquiry text is never copied into the outbound draft; there is no mail transport.
 */
export function buildDistributionDraft(input: DistributionDraftInput): DistributionDraft {
  const buyerName = clean(input.buyerName, 160) || "there";
  const titleName = clean(input.titleName, 200);
  const titleLine = titleName ? ` regarding “${titleName}”` : "";
  // Sanitize/limit the untrusted inquiry even though it is not copied into the reply.
  clean(input.inquiryText, 4000);

  const subject = `Crayons Pictures — distribution inquiry${titleName ? `: ${titleName}` : ""}`;
  const body = [
    `Hello ${buyerName},`,
    "",
    `Thank you for contacting Crayons Pictures${titleLine}.`,
    "",
    "We have recorded your inquiry and are reviewing the relevant title metadata, territory, language, media/exploitation rights, licensing window, exclusivity and approved commercial terms.",
    "Availability, pricing, delivery timing and screening access are not confirmed by this message. We will respond after the applicable Bridge records and evidence have been reviewed.",
    "",
    "Regards,",
    "Crayons Pictures Distribution",
  ].join("\n");

  return { subject, body, status: "DRAFT_PENDING_OPERATOR_APPROVAL", claimsAvailability: false, outboundAction: "NONE" };
}

export function assertDraftCanBeApproved(input: {
  draftSubject: string;
  draftBody: string;
  reviewerUserId: string;
  explicitApproval: boolean;
}): void {
  if (!input.explicitApproval) throw new Error("Explicit human approval is required");
  if (!input.reviewerUserId.trim()) throw new Error("Verified reviewer identity is required");
  if (!input.draftSubject.trim() || !input.draftBody.trim()) throw new Error("A complete draft is required");
  if (input.draftSubject.length > 300 || input.draftBody.length > 12000) throw new Error("Draft exceeds allowed length");
}
