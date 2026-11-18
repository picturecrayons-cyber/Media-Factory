import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { canGrantInternalRole, permissionsFor, type Actor } from "./rbac";
import { ACCOUNT_TYPES, INTERNAL_ROLES, PERMISSIONS, type AccountType, type InternalRole } from "./types";

/** Exposes the checked-in RBAC policy registry; does not read or change user role assignments. */
export const getSuperAdminRbacGovernance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Super Admin access required");
    }

    const internalRoles = INTERNAL_ROLES.map((role) => {
      const candidate: Actor = {
        userId: "policy-preview",
        emailVerified: true,
        accountType: "independent_creator",
        internalRole: role,
      };
      return {
        role,
        permissions: [...permissionsFor(candidate)].sort(),
        mayGrant: INTERNAL_ROLES.filter((target) => canGrantInternalRole(candidate, target)),
      };
    });
    const accountTypes = ACCOUNT_TYPES.map((accountType) => {
      const candidate: Actor = {
        userId: "policy-preview",
        emailVerified: true,
        accountType,
        internalRole: null,
      };
      return { accountType, permissions: [...permissionsFor(candidate)].sort() };
    });

    return {
      permissions: [...PERMISSIONS],
      internalRoles,
      accountTypes,
      source: "checked-in application RBAC policy",
      assignments: "NOT_QUERIED",
      mutationControls: "NOT_IMPLEMENTED",
    };
  });
