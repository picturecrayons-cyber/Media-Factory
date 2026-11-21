/** Canonical submission classification used by the Studio Finished Films server response. */
export function isStudioFinishedFilm(submissionType: string | null | undefined): boolean {
  return submissionType === "finished_film";
}

/** Owner access is retained for unscoped legacy titles; shared access requires the exact active organization. */
export function canStudioAccessTitle(input: {
  titleOwnerUserId: string;
  titleOwnerOrganizationId: string | null | undefined;
  actorUserId: string;
  actorOrganizationId: string | null | undefined;
  activeOrganizationMembership: boolean;
}): boolean {
  if (input.titleOwnerUserId === input.actorUserId) return true;
  return Boolean(
    input.titleOwnerOrganizationId &&
    input.actorOrganizationId &&
    input.titleOwnerOrganizationId === input.actorOrganizationId &&
    input.activeOrganizationMembership
  );
}
