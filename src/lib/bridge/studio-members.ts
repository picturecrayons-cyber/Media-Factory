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

async function requireStudioMember(userId: string) {
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
  const membershipRole = rows[0]?.membership_role;
  if (!membershipRole || !["owner", "admin", "producer", "dit", "member"].includes(membershipRole)) {
    throw new Error("An active Studio organization membership is required");
  }
  return { actor, sql, membershipRole };
}

async function requireStudioManager(userId: string) {
  const result = await requireStudioMember(userId);
  if (result.membershipRole !== "owner" && result.membershipRole !== "admin") {
    throw new Error("An active Studio owner or admin membership is required");
  }
  return { actor: result.actor, sql: result.sql, managerRole: result.membershipRole };
}

/** Read the roster for the caller's verified Studio organization only. */
export const listStudioMembers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ members: StudioMember[]; currentUserId: string; managerRole: string }> => {
    const { actor, sql, membershipRole } = await requireStudioMember(context.userId);
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
      managerRole: membershipRole,
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


export type StudioOwnershipTransfer = {
  id: string;
  currentOwnerUserId: string;
  currentOwnerName: string;
  proposedOwnerUserId: string;
  proposedOwnerName: string;
  status: string;
  reason: string;
  createdAt: string;
};

export const listStudioOwnershipTransfers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ transfers: StudioOwnershipTransfer[] }> => {
    const { actor, sql } = await requireStudioManager(context.userId);
    const rows = await sql<{
      id: string;
      current_owner_user_id: string;
      current_owner_name: string;
      proposed_owner_user_id: string;
      proposed_owner_name: string;
      status: string;
      reason: string;
      created_at: string | Date;
    }>`
      select x.id::text as id, x.current_owner_user_id,
        co.display_name as current_owner_name, x.proposed_owner_user_id,
        po.display_name as proposed_owner_name, x.status, x.reason, x.created_at
      from bridge_studio_ownership_transfers x
      join bridge_profiles co on co.user_id = x.current_owner_user_id
      join bridge_profiles po on po.user_id = x.proposed_owner_user_id
      where x.organization_id = ${actor.organizationId}::uuid
        and x.status = 'PENDING'
        and (x.current_owner_user_id = ${actor.userId} or x.proposed_owner_user_id = ${actor.userId})
      order by x.created_at desc
      limit 20
    `;
    return { transfers: rows.map((row) => ({
      id: row.id,
      currentOwnerUserId: row.current_owner_user_id,
      currentOwnerName: row.current_owner_name,
      proposedOwnerUserId: row.proposed_owner_user_id,
      proposedOwnerName: row.proposed_owner_name,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    })) };
  });

export const requestStudioOwnershipTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    proposedOwnerUserId: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(8).max(1000),
  }))
  .handler(async ({ context, data }) => {
    const { actor, sql, managerRole } = await requireStudioManager(context.userId);
    if (managerRole !== "owner") throw new Error("Only the current Studio owner can request ownership transfer");
    const target = await sql<{ membership_role: string; status: string; account_type: string }>`
      select m.membership_role, m.status, p.account_type
      from bridge_organization_memberships m
      join bridge_profiles p on p.user_id = m.user_id
      where m.organization_id = ${actor.organizationId}::uuid and m.user_id = ${data.proposedOwnerUserId}
      limit 1
    `;
    if (!target[0] || target[0].membership_role !== "admin" || target[0].status !== "active" || target[0].account_type !== "studio") {
      throw new Error("Ownership can only be offered to an active Studio admin in this organization");
    }
    const result = await sql.transaction(async (tx) => {
      const created = await tx<{ id: string }>`
        insert into bridge_studio_ownership_transfers (
          organization_id, current_owner_user_id, proposed_owner_user_id, reason
        ) values (
          ${actor.organizationId}::uuid, ${actor.userId}, ${data.proposedOwnerUserId}, ${data.reason}
        )
        returning id::text as id
      `;
      await tx`
        insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values (
          ${actor.userId}, 'studio.ownership_transfer_requested',
          'bridge_studio_ownership_transfer', ${created[0].id},
          ${JSON.stringify({ organizationId: actor.organizationId, proposedOwnerUserId: data.proposedOwnerUserId, reason: data.reason })}
        )
      `;
      return created[0];
    });
    return { transferId: result.id, status: "PENDING" as const };
  });

export const acceptStudioOwnershipTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ transferId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { actor, sql, managerRole } = await requireStudioManager(context.userId);
    if (managerRole !== "admin") throw new Error("Only the nominated active Studio admin can accept ownership");
    await sql.transaction(async (tx) => {
      const requests = await tx<{
        current_owner_user_id: string;
        proposed_owner_user_id: string;
        reason: string;
      }>`
        select current_owner_user_id, proposed_owner_user_id, reason
        from bridge_studio_ownership_transfers
        where id = ${data.transferId}::uuid
          and organization_id = ${actor.organizationId}::uuid
          and status = 'PENDING'
        for update
      `;
      const transfer = requests[0];
      if (!transfer || transfer.proposed_owner_user_id !== actor.userId) {
        throw new Error("No pending ownership transfer is addressed to this account");
      }
      const owners = await tx<{ membership_role: string; status: string }>`
        select membership_role, status from bridge_organization_memberships
        where organization_id = ${actor.organizationId}::uuid and user_id = ${transfer.current_owner_user_id}
        for update
      `;
      const target = await tx<{ membership_role: string; status: string }>`
        select membership_role, status from bridge_organization_memberships
        where organization_id = ${actor.organizationId}::uuid and user_id = ${actor.userId}
        for update
      `;
      if (owners[0]?.membership_role !== "owner" || owners[0]?.status !== "active" ||
          target[0]?.membership_role !== "admin" || target[0]?.status !== "active") {
        throw new Error("Ownership transfer is no longer valid because the owner or nominated admin membership changed");
      }
      await tx`
        update bridge_organization_memberships
        set membership_role = 'admin', updated_at = now()
        where organization_id = ${actor.organizationId}::uuid and user_id = ${transfer.current_owner_user_id}
      `;
      await tx`
        update bridge_organization_memberships
        set membership_role = 'owner', updated_at = now()
        where organization_id = ${actor.organizationId}::uuid and user_id = ${actor.userId}
      `;
      await tx`
        update bridge_studio_ownership_transfers set status = 'ACCEPTED', accepted_at = now()
        where id = ${data.transferId}::uuid and status = 'PENDING'
      `;
      await tx`
        insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values (
          ${actor.userId}, 'studio.ownership_transfer_accepted',
          'bridge_studio_ownership_transfer', ${data.transferId},
          ${JSON.stringify({ organizationId: actor.organizationId, previousOwnerUserId: transfer.current_owner_user_id, newOwnerUserId: actor.userId, reason: transfer.reason })}
        )
      `;
    });
    return { transferId: data.transferId, status: "ACCEPTED" as const };
  });

export const cancelStudioOwnershipTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ transferId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { actor, sql, managerRole } = await requireStudioManager(context.userId);
    if (managerRole !== "owner") throw new Error("Only the current Studio owner can cancel an ownership transfer");
    await sql.transaction(async (tx) => {
      const rows = await tx`
        update bridge_studio_ownership_transfers set status = 'CANCELLED', cancelled_at = now()
        where id = ${data.transferId}::uuid
          and organization_id = ${actor.organizationId}::uuid
          and current_owner_user_id = ${actor.userId}
          and status = 'PENDING'
        returning id
      `;
      if (!rows.length) throw new Error("Pending Studio ownership transfer was not found");
      await tx`
        insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values (
          ${actor.userId}, 'studio.ownership_transfer_cancelled',
          'bridge_studio_ownership_transfer', ${data.transferId},
          ${JSON.stringify({ organizationId: actor.organizationId })}
        )
      `;
    });
    return { transferId: data.transferId, status: "CANCELLED" as const };
  });
