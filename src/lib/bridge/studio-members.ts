import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";

export type StudioMember = {
  userId: string;
  displayName: string;
  email: string;
  accountType: string;
  membershipRole: string;
  status: string;
  createdAt: string;
};

const memberRole = z.enum(["admin", "producer", "dit", "member"]);
const memberStatus = z.enum(["active", "suspended", "removed"]);

async function requireStudioManager(userId: string) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  if (actor.internalRole || actor.accountType !== "studio" || !actor.organizationId) {
    throw new Error("Verified Studio organization access is required");
  }
  const sql = await getSql();
  const rows = await sql<{ membership_role: string }>`
    select m.membership_role
    from bridge_organization_memberships m
    join bridge_organizations o on o.id = m.organization_id and o.status = 'active'
    where m.organization_id = ${actor.organizationId}::uuid
      and m.user_id = ${actor.userId}
      and m.status = 'active'
    limit 1
  `;
  const managerRole = rows[0]?.membership_role;
  if (managerRole !== "owner" && managerRole !== "admin") {
    throw new Error("An active Studio owner or admin membership is required");
  }
  return { actor, sql, managerRole };
}

/** Read the roster for the caller's verified Studio organization only. */
export const listStudioMembers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ members: StudioMember[]; currentUserId: string; managerRole: string }> => {
    const { actor, sql, managerRole } = await requireStudioManager(context.userId);
    const rows = await sql<{
      user_id: string;
      display_name: string;
      email: string;
      account_type: string;
      membership_role: string;
      status: string;
      created_at: string | Date;
    }>`
      select p.user_id, p.display_name, p.email, p.account_type,
        m.membership_role, m.status, m.created_at
      from bridge_organization_memberships m
      join bridge_profiles p on p.user_id = m.user_id
      join bridge_organizations o on o.id = m.organization_id
      where m.organization_id = ${actor.organizationId}::uuid
        and m.status in ('active', 'suspended', 'removed')
        and o.status = 'active'
      order by case m.membership_role
        when 'owner' then 0 when 'admin' then 1 when 'producer' then 2
        when 'dit' then 3 else 4 end, p.display_name, p.email
    `;
    return {
      currentUserId: actor.userId,
      managerRole,
      members: rows.map((row) => ({
        userId: row.user_id,
        displayName: row.display_name,
        email: row.email,
        accountType: row.account_type,
        membershipRole: row.membership_role,
        status: row.status,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
    };
  });

const updateMemberInput = z.object({
  memberUserId: z.string().trim().min(1).max(160),
  membershipRole: memberRole,
  status: memberStatus,
});

/**
 * Update one existing Studio membership. Owners cannot be demoted or suspended
 * through this action, self-lockout is blocked, and every change is audited
 * inside the same transaction as the membership update.
 */
export const updateStudioMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateMemberInput)
  .handler(async ({ context, data }) => {
    const { actor, sql, managerRole } = await requireStudioManager(context.userId);
    if (data.memberUserId === actor.userId) {
      throw new Error("You cannot change or remove your own Studio membership");
    }
    if (data.membershipRole === "admin" && managerRole !== "owner") {
      throw new Error("Only the Studio owner can grant the admin role");
    }

    await sql.transaction(async (tx) => {
      const rows = await tx<{ membership_role: string; status: string; account_type: string }>`
        select m.membership_role, m.status, p.account_type
        from bridge_organization_memberships m
        join bridge_profiles p on p.user_id = m.user_id
        join bridge_organizations o on o.id = m.organization_id and o.status = 'active'
        where m.organization_id = ${actor.organizationId}::uuid
          and m.user_id = ${data.memberUserId}
        for update of m
      `;
      const existing = rows[0];
      if (!existing || existing.account_type !== "studio") {
        throw new Error("Studio member was not found in this organization");
      }
      if (existing.membership_role === "owner") {
        throw new Error("Owner access cannot be changed here. Use the reviewed ownership-transfer process.");
      }
      if (managerRole !== "owner" && existing.membership_role === "admin") {
        throw new Error("Only the Studio owner can change another admin membership");
      }
      if (existing.status === "removed") {
        throw new Error("Removed memberships are immutable. Create a reviewed re-invitation flow to restore access.");
      }

      await tx`
        update bridge_organization_memberships
        set membership_role = ${data.membershipRole},
            status = ${data.status},
            updated_at = now()
        where organization_id = ${actor.organizationId}::uuid
          and user_id = ${data.memberUserId}
      `;
      await tx`
        insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values (
          ${actor.userId},
          'studio.membership_updated',
          'bridge_organization_membership',
          ${data.memberUserId},
          ${JSON.stringify({
            organizationId: actor.organizationId,
            previousRole: existing.membership_role,
            previousStatus: existing.status,
            membershipRole: data.membershipRole,
            status: data.status,
          })}
        )
      `;
    });
    return { userId: data.memberUserId, membershipRole: data.membershipRole, status: data.status };
  });
