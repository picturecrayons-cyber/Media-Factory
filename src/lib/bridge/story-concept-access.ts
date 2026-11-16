/**
 * Story/Concept workspace scope is distinct from commercial Buyer membership.
 * Only verified Studio actors may use a Studio organization to read Studio-owned
 * submissions. Buyer membership in the same legal organization is not creator
 * workspace authority.
 */
export function storyConceptOrganizationScope(actor: {
  accountType: string;
  organizationId?: string | null;
}): string | null {
  if (actor.accountType !== "studio") return null;
  return actor.organizationId ?? null;
}
