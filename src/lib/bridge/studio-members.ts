import { createServerFn } from "@tanstack/react-start";
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

export const listStudioMembers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ members: StudioMember[] }> => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "studio") throw new Error("Studio account required");
    if (!actor.organizationId) throw new Error("Studio organization membership is not configured for this account");

    const sql = await getSql();
    try {
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
          and m.status <> 'removed'
          and o.status = 'active'
        order by case m.membership_role
          when 'owner' then 0 when 'admin' then 1 when 'producer' then 2
          when 'dit' then 3 else 4 end, p.display_name, p.email
      `;
      return {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/bridge_organization_memberships|bridge_organizations|does not exist|undefined_table/i.test(message)) {
        throw new Error("Studio membership records are unavailable in this environment. No member list was assumed.");
      }
      throw error;
    }
  });
