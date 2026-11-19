import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { writeAudit } from "./audit";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { canGrantInternalRole, permissionsFor, type Actor } from "./rbac";
import { ACCOUNT_TYPES, INTERNAL_ROLES, PERMISSIONS } from "./types";

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
      assignments: "AVAILABLE_IN_SEPARATE_LIVE_INVENTORY",
      mutationControls: "FEATURE_FLAG_GATED; SUPER_ADMIN_PROMOTION_PROTECTED",
    };
  });

const roleAssignmentInput = z.object({
  userId: z.string().min(1).max(256),
  role: z.enum(INTERNAL_ROLES).nullable(),
});

/** Live role assignment inventory plus an opt-in, fail-closed audited role-change action. */
export const listSuperAdminRoleAssignments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    const sql = await getSql();
    const rows = await sql<{
      user_id: string; email: string; display_name: string; account_type: string;
      internal_role: string | null; email_verified: boolean; created_at: string | Date;
    }>`
      select user_id,email,display_name,account_type,internal_role,email_verified,created_at
      from bridge_profiles order by created_at desc limit 500
    `;
    return {
      assignments: rows.map(row => ({
        userId: row.user_id, email: row.email, displayName: row.display_name,
        accountType: row.account_type, internalRole: row.internal_role,
        emailVerified: Boolean(row.email_verified),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
      mutationsEnabled: process.env.BRIDGE_SUPER_ADMIN_RBAC_WRITES === "true",
      protectedRole: "super_admin",
    };
  });

/**
 * Writes remain disabled unless a deployment operator explicitly enables the
 * Preview-only feature flag. Super Admin assignment/promotion is never allowed
 * through this workflow; it requires a separate identity-verification process.
 */
export const updateSuperAdminRoleAssignment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(roleAssignmentInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    if (process.env.BRIDGE_SUPER_ADMIN_RBAC_WRITES !== "true") {
      throw new Error("RBAC role changes are disabled until the Preview-only feature flag is explicitly enabled");
    }
    if (data.userId === actor.userId) throw new Error("Self-role changes are not permitted");
    if (data.role === "super_admin") throw new Error("Super Admin promotion requires a separate identity-verification process");
    if (data.role && !canGrantInternalRole(actor, data.role)) throw new Error("Role grant is not permitted");

    const sql = await getSql();
    await sql.transaction(async tx => {
      const rows = await tx<{ internal_role: string | null; email_verified: boolean }>`
        select internal_role,email_verified from bridge_profiles where user_id=${data.userId} for update
      `;
      const target = rows[0];
      if (!target) throw new Error("Target profile not found");
      if (!target.email_verified) throw new Error("Target profile email must be verified");
      if (target.internal_role === "super_admin") throw new Error("Existing Super Admin role is protected");
      if (target.internal_role === data.role) return;
      await tx`
        update bridge_profiles set internal_role=${data.role},updated_at=now()
        where user_id=${data.userId} and internal_role is distinct from 'super_admin'
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "rbac.internal_role_changed",
        entityType: "bridge_profile",
        entityId: data.userId,
        metadata: { fromRole: target.internal_role, toRole: data.role, targetEmailVerified: true },
      }, tx);
    });
    return { updated: true };
  });
