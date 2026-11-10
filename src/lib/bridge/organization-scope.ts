export type StudioMembershipStatus = "invited" | "active" | "suspended" | "removed";
export type StudioOrganizationStatus = "active" | "suspended" | "closed";
export type StudioMembershipRole = "owner" | "admin" | "member";

export type StudioMembershipRecord = {
  userId: string;
  organizationId: string;
  membershipRole: StudioMembershipRole;
  membershipStatus: StudioMembershipStatus;
  organizationStatus: StudioOrganizationStatus;
};

/**
 * Return only explicit, active memberships for this Bridge user.
 *
 * This is a pure authorization helper: it never infers membership from an
 * organization name, profile.organization_id, email domain, or title owner.
 */
export function activeStudioOrganizationIds(
  userId: string,
  memberships: readonly StudioMembershipRecord[],
): string[] {
  if (!userId) return [];
  const ids = new Set<string>();
  for (const membership of memberships) {
    if (
      membership.userId === userId &&
      membership.membershipStatus === "active" &&
      membership.organizationStatus === "active" &&
      membership.organizationId.trim().length > 0
    ) {
      ids.add(membership.organizationId);
    }
  }
  return [...ids].sort();
}

export function hasActiveStudioMembership(
  userId: string,
  organizationId: string,
  memberships: readonly StudioMembershipRecord[],
): boolean {
  if (!organizationId) return false;
  return activeStudioOrganizationIds(userId, memberships).includes(organizationId);
}
