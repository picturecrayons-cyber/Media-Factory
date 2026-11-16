/**
 * Story/Concept workspace scope is distinct from commercial Buyer membership.
 * Only creator/studio accounts may read their own submissions; only Studio
 * accounts may additionally read submissions owned by their Studio organization.
 */
export function storyConceptOwnerUserScope(actor: {
  accountType: string;
  userId: string;
}): string | null {
  if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") {
    return null;
  }
  return actor.userId;
}

export function storyConceptOrganizationScope(actor: {
  accountType: string;
  organizationId?: string | null;
}): string | null {
  if (actor.accountType !== "studio") return null;
  return actor.organizationId ?? null;
}
