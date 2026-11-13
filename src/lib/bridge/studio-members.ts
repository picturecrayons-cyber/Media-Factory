import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

const MEMBER_ROLES = ["member", "producer", "dit", "admin"] as const;
const MEMBER_STATUSES = ["active", "suspended", "removed"] as const;

export type StudioMember = {
  userId: string;
  displayName: string;
  email: string;
  accountType: string;
  membershipRole: string;
  status: string;
  createdAt: string;
};

async function requireStudioManager(userId: string) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  if (actor.internalRole || actor.accountType !== "studio") throw new Error("Studio account required");
  if (!actor.organizationId || !["owner", "admin"].includes(actor.organizationRole ?? "")) {
    throw new Error("Studio owner or admin membership required");
  }
  return actor;
}

export const listStudioMembers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ members: StudioMember[]; managerRole: string }> => {
    const actor = await requireStudioManager(context.userId);
    const sql = await getSql();
    try {
      const rows = await sql<{
        user_id: string; display_name: string; email: string; account_type: string;
        membership_role: string; status: string; created_at: string | Date;
      }>`
        select p.user_id, p.display_name, p.email, p.account_type,
          m.membership_role, m.status, m.created_at
        from bridge_organization_memberships m
        join bridge_profiles p on p.user_id = m.user_id
        join bridge_organizations o on o.id = m.organization_id
        where m.organization_id = ${actor.organizationId}::uuid
          and m.status in ('active', 'suspended')
          and o.status = 'active'
        order by case m.membership_role
          when 'owner' then 0 when 'admin' then 1 when 'producer' then 2
          when 'dit' then 3 else 4 end, p.display_name, p.email
      `;
      return {
        managerRole: actor.organizationRole!,
        members: rows.map((row) => ({
          userId: row.user_id, displayName: row.display_name, email: row.email,
          accountType: row.account_type, membershipRole: row.membership_role,
          status: row.status,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/bridge_organization_memberships|bridge_organizations|does not exist|undefined_table/i.test(message)) {
        throw new Error("Studio membership records are unavailable in this environment. No member list was assumed.");
      }
      throw error;
    }
  });

export const updateStudioMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    userId: z.string().min(1).max(256),
    membershipRole: z.enum(MEMBER_ROLES),
    status: z.enum(MEMBER_STATUSES),
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireStudioManager(context.userId);
    const sql = await getSql();
    await sql.transaction(async (tx) => {
      const rows = await tx<{
        membership_role: string; status: string;
      }>`
        select m.membership_role, m.status
        from bridge_organization_memberships m
        join bridge_profiles p on p.user_id = m.user_id
        where m.organization_id = ${actor.organizationId}::uuid
          and m.user_id = ${data.userId}
          and p.account_type = 'studio'
        for update
      `;
      const current = rows[0];
      if (!current) throw new Error("Studio member not found in your organization");
      if (current.membership_role === "owner") throw new Error("Studio owner role is protected");
      if (actor.organizationRole === "admin" &&
          (current.membership_role === "admin" || data.membershipRole === "admin")) {
        throw new Error("Only the Studio owner can manage administrator roles");
      }
      if (data.membershipRole === "admin" && actor.organizationRole !== "owner") {
        throw new Error("Only the Studio owner can grant administrator access");
      }

      await tx`
        update bridge_organization_memberships
        set membership_role = ${data.membershipRole},
            status = ${data.status},
            updated_at = now()
        where organization_id = ${actor.organizationId}::uuid
          and user_id = ${data.userId}
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "studio.membership_updated",
        entityType: "bridge_organization_membership",
        entityId: data.userId,
        metadata: {
          organizationId: actor.organizationId,
          previousRole: current.membership_role,
          previousStatus: current.status,
          membershipRole: data.membershipRole,
          status: data.status,
        },
      }, tx);
    });
    return { updated: true };
  });
