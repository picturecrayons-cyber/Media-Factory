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
