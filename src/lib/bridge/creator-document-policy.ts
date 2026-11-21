const SUPPORTED_MIME_TYPES = new Set(["application/pdf"]);

export function isSupportedCreatorDocumentMimeType(value: string) {
  return SUPPORTED_MIME_TYPES.has(value);
}

export function sameOwner(
  actor: { userId: string; accountType: string; organizationId?: string | null },
  doc: { owner_user_id: string; owner_account_type: string; owner_organization_id: string | null },
) {
  if (doc.owner_account_type === "independent_creator") {
    return actor.accountType === "independent_creator" && actor.userId === doc.owner_user_id;
  }
  return actor.accountType === "studio" &&
    Boolean(actor.organizationId) &&
    actor.organizationId === doc.owner_organization_id;
}

/** Safe client-facing error; detailed database diagnostics stay in server logs. */
export function creatorDocumentListFailureMessage(reference: string): string {
  return `Document Vault is temporarily unavailable. Retry the request. Reference: ${reference}`;
}

export function isEvidenceCompatibleWithSubmission(
  submissionType: string | null | undefined,
  documentType: string,
): boolean {
  if (submissionType === "story_concept") {
    return ["STORY_CONCEPT_AGREEMENT", "OWNERSHIP_CHAIN_OF_TITLE", "AUTHOR_ASSIGNMENT", "OTHER"].includes(documentType);
  }
  if (submissionType === "finished_film") {
    return [
      "FINISHED_FILM_AGREEMENT",
      "DISTRIBUTION_AGREEMENT",
      "OWNERSHIP_CHAIN_OF_TITLE",
      "AUTHOR_ASSIGNMENT",
      "MUSIC_RIGHTS",
      "OTHER",
    ].includes(documentType);
  }
  return false;
}

export function canRevokeCreatorDocument(input: {
  actorUserId: string;
  accountType: string;
  organizationId?: string | null;
  internalRole?: string | null;
  owner_user_id: string;
  owner_account_type: string;
  owner_organization_id: string | null;
}): boolean {
  if (input.internalRole === "super_admin" || input.internalRole === "legal_reviewer") return true;
  return sameOwner(
    { userId: input.actorUserId, accountType: input.accountType, organizationId: input.organizationId },
    input,
  );
}
