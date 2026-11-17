import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";

/** Read-only view of the canonical organization and membership records. No invitations are sent. */
export const listSuperAdminOrganizationGovernance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Super Admin access required");
    }

    const sql = await getSql();
    const [organizations, memberships] = await Promise.all([
      sql<{
        id: string;
        legal_name: string;
        status: string;
        created_at: string | Date;
        member_count: number | string;
      }>`
        select o.id, o.legal_name, o.status, o.created_at,
               count(m.user_id)::int as member_count
        from bridge_organizations o
        left join bridge_organization_memberships m on m.organization_id = o.id
        group by o.id
        order by o.created_at desc
        limit 200
      `,
      sql<{
        organization_id: string;
        legal_name: string;
        user_id: string;
        display_name: string;
        account_type: string;
        membership_role: string;
        status: string;
        created_at: string | Date;
      }>`
        select m.organization_id, o.legal_name, bp.user_id, bp.display_name,
               bp.account_type, m.membership_role, m.status, m.created_at
        from bridge_organization_memberships m
        join bridge_organizations o on o.id = m.organization_id
        join bridge_profiles bp on bp.user_id = m.user_id
        order by m.created_at desc
        limit 300
      `,
    ]);

    return {
      organizations: organizations.map((row) => ({
        id: row.id,
        legalName: row.legal_name,
        status: row.status,
        memberCount: Number(row.member_count),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
      memberships: memberships.map((row) => ({
        organizationId: row.organization_id,
        organizationName: row.legal_name,
        userReference: row.user_id,
        displayName: row.display_name,
        accountType: row.account_type,
        role: row.membership_role,
        status: row.status,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
      invitationWorkflow: "NOT_IMPLEMENTED",
    };
  });
