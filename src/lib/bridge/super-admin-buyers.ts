import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor, resolveBridgeUserId } from "./session";

/**
 * Super Admin Buyer Operations read model.
 *
 * Buyer identities remain independent Bridge profiles. Organization names on
 * profiles are descriptive only; only canonical organization foreign keys and
 * active membership rows establish membership. This endpoint intentionally
 * performs SELECTs only and never creates roles, grants, entitlements or access.
 */
export const listSuperAdminBuyerManagement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const bridgeUserId = await resolveBridgeUserId(context.userId);
    const actor = await requireVerifiedActor(bridgeUserId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Super Admin access required");
    }

    const sql = await getSql();
    const [buyers, organizations, packages, payments, entitlements, audit] = await Promise.all([
      sql<{
        user_id: string; email: string; display_name: string; account_type: string;
        organization_name: string | null; organization_id: string | null;
        email_verified: boolean; created_at: string | Date | null; updated_at: string | Date | null;
      }>`
        select p.user_id, p.email, p.display_name, p.account_type,
               p.organization_name, p.organization_id, p.email_verified,
               p.created_at, p.updated_at
        from public.bridge_profiles p
        where p.account_type = 'buyer'
        order by p.created_at desc nulls last, p.user_id
        limit 500
      `,
      sql<{
        id: string; legal_name: string; status: string; member_count: number | string;
        buyer_count: number | string; created_at: string | Date;
      }>`
        select o.id, o.legal_name, o.status, o.created_at,
          count(distinct m.user_id)::int as member_count,
          count(distinct p.user_id) filter (where p.account_type='buyer')::int as buyer_count
        from public.bridge_organizations o
        left join public.bridge_organization_memberships m on m.organization_id=o.id and m.status='active'
        left join public.bridge_profiles p on p.user_id=m.user_id
        group by o.id
        order by o.created_at desc
        limit 200
      `,
      sql<{ status: string; count: number | string }>`
        select status, count(*)::int as count
        from public.bridge_license_packages
        group by status order by status
      `,
      sql<{ status: string; count: number | string; amount_paise: number | string }>`
        select status, count(*)::int as count,
          coalesce(sum(amount_paise) filter (where status='captured'),0)::bigint as amount_paise
        from public.bridge_payments
        group by status order by status
      `,
      sql<{ access_type: string; count: number | string }>`
        select access_type, count(*)::int as count
        from public.bridge_entitlements
        group by access_type order by access_type
      `,
      sql<{ created_at: string | Date; action: string; entity_type: string; entity_id: string | null; actor_user_id: string }>`
        select created_at, action, entity_type, entity_id, actor_user_id
        from public.bridge_audit_logs
        where action like 'buyer.%' or action like 'organization.%'
          or action like 'payment.%' or action like 'licensing.%'
        order by created_at desc limit 100
      `,
    ]);
    const buyerIds = buyers.map((row) => row.user_id);
    const membershipRows = buyerIds.length
      ? await sql<{
          organization_id: string; user_id: string; membership_role: string; status: string;
          legal_name: string;
        }>`
          select m.organization_id, m.user_id, m.membership_role, m.status, o.legal_name
          from public.bridge_organization_memberships m
          join public.bridge_organizations o on o.id=m.organization_id
          where m.user_id = any(${buyerIds}::text[])
          order by o.legal_name, m.user_id
        `
      : [];
    const membershipByUser = new Map<string, typeof membershipRows>();
    for (const row of membershipRows) {
      const items = membershipByUser.get(row.user_id) ?? [];
      items.push(row);
      membershipByUser.set(row.user_id, items);
    }
    return {
      generatedAt: new Date().toISOString(),
      buyerCount: buyers.length,
      organizationCount: organizations.length,
      buyers: buyers.map((row) => ({
        userId: row.user_id,
        email: row.email,
        displayName: row.display_name,
        accountType: row.account_type,
        organizationLabel: row.organization_name,
        organizationId: row.organization_id,
        emailVerified: row.email_verified,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ? String(row.created_at) : null,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ? String(row.updated_at) : null,
        memberships: (membershipByUser.get(row.user_id) ?? []).map((m) => ({
          organizationId: m.organization_id,
          organizationName: m.legal_name,
          role: m.membership_role,
          status: m.status,
        })),
      })),
      organizations: organizations.map((row) => ({
        id: row.id, legalName: row.legal_name, status: row.status,
        memberCount: Number(row.member_count), buyerCount: Number(row.buyer_count),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
      licensing: {
        packageStates: packages.map((row) => ({ status: row.status, count: Number(row.count) })),
        paymentStates: payments.map((row) => ({
          status: row.status, count: Number(row.count), capturedAmountPaise: Number(row.amount_paise),
        })),
        entitlementStates: entitlements.map((row) => ({ accessType: row.access_type, count: Number(row.count) })),
      },
      recentAudit: audit.map((row) => ({
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        action: row.action, entityType: row.entity_type, entityId: row.entity_id,
        actorReference: row.actor_user_id,
      })),
      authorization: {
        profileWindow: "LATEST_500_BUYER_PROFILES",
        organizationsWindow: "LATEST_200_ORGANIZATIONS",
        mutatingActionsEnabled: false,
        accountCreation: "NOT_EXPOSED",
        roleChanges: "NOT_EXPOSED",
        licensingAndEntitlements: "OWNED_BY_EXISTING_BRIDGE_PAYMENT_WORKFLOW",
      },
    };
  });

