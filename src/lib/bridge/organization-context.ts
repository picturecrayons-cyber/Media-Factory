import {
  activeStudioOrganizationIds,
  type StudioMembershipRecord,
} from "./organization-scope.ts";

export type StudioOrganizationContext = {
  userId: string;
  selectedOrganizationId: string;
};

/**
 * Resolve one explicit organization context from the freshly loaded membership
 * rows. Call this inside each sensitive server operation; never trust a client
 * selection without re-checking active membership and organization status.
 */
export function resolveStudioOrganizationContext(
  userId: string,
  requestedOrganizationId: string | null | undefined,
  memberships: readonly StudioMembershipRecord[],
): StudioOrganizationContext | null {
  if (!userId || !requestedOrganizationId?.trim()) return null;
  const activeIds = activeStudioOrganizationIds(userId, memberships);
  if (!activeIds.includes(requestedOrganizationId)) return null;
  return { userId, selectedOrganizationId: requestedOrganizationId };
}

/** Membership status changes invalidate a previously selected context. */
export function isStudioOrganizationContextCurrent(
  context: StudioOrganizationContext | null,
  memberships: readonly StudioMembershipRecord[],
): boolean {
  if (!context) return false;
  return activeStudioOrganizationIds(context.userId, memberships).includes(
    context.selectedOrganizationId,
  );
}
