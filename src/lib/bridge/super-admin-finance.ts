import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";

/**
 * Read-only operational payment oversight for Super Admin.
 * Deliberately omits buyer identity, email, checkout credentials and entitlement data.
 * It does not call Razorpay or mutate payment, invoice, ledger or entitlement records.
 */
export const listSuperAdminPaymentOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Super Admin access required");
    }

    const sql = await getSql();
    const [groups, recent, settlements] = await Promise.all([
      sql<{
        status: string;
        currency: string;
        payment_count: number | string;
        total_amount_paise: number | string;
      }>`
        select status, currency, count(*)::int as payment_count,
               coalesce(sum(amount_paise), 0)::bigint as total_amount_paise
        from bridge_payments
        group by status, currency
        order by status, currency
      `,
      sql<{
        id: string;
        title_name: string | null;
        purpose: string;
        provider: string;
        status: string;
        amount_paise: number | string;
        currency: string;
        created_at: string | Date;
        verified_at: string | Date | null;
      }>`
        select p.id, t.name as title_name, p.purpose, p.provider, p.status,
               p.amount_paise, p.currency, p.created_at, p.verified_at
        from bridge_payments p
        left join bridge_titles t on t.id = p.title_id
        order by p.created_at desc
        limit 25
      sql<{
        status: string;
        currency: string;
        settlement_count: number | string;
        revenue_received_paise: number | string;
        creator_payable_paise: number | string;
        investor_payable_paise: number | string;
        bridge_share_paise: number | string;
      }>`
        select status, currency, count(*)::int as settlement_count,
               coalesce(sum(revenue_received_paise), 0)::bigint as revenue_received_paise,
               coalesce(sum(creator_payable_paise), 0)::bigint as creator_payable_paise,
               coalesce(sum(investor_payable_paise), 0)::bigint as investor_payable_paise,
               coalesce(sum(bridge_share_paise), 0)::bigint as bridge_share_paise
        from bridge_title_settlements
        group by status, currency
        order by status, currency
      `,
      sql<{
        id: string;
        title_name: string;
        revenue_received_paise: number | string;
        creator_payable_paise: number | string;
        investor_payable_paise: number | string;
        bridge_share_paise: number | string;
        currency: string;
        status: string;
        settled_at: string | Date | null;
        created_at: string | Date;
      }>`
        select s.id, t.name as title_name, s.revenue_received_paise,
               s.creator_payable_paise, s.investor_payable_paise,
               s.bridge_share_paise, s.currency, s.status, s.settled_at, s.created_at
        from bridge_title_settlements s
        join bridge_titles t on t.id = s.title_id
        order by s.created_at desc
        limit 50
      `,
      `,
    ]);

    return {
      summary: groups.map((row) => ({
        status: row.status,
        currency: row.currency,
        paymentCount: Number(row.payment_count),
        totalAmountPaise: Number(row.total_amount_paise),
      })),
      recentPayments: recent.map((row) => ({
        reference: row.id,
        titleName: row.title_name,
        purpose: row.purpose,
        provider: row.provider,
        status: row.status,
        amountPaise: Number(row.amount_paise),
        currency: row.currency,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        verifiedAt: row.verified_at == null
          ? null
          : row.verified_at instanceof Date
            ? row.verified_at.toISOString()
            : String(row.verified_at),
      })),
      settlementSummary: settlements.filter((row) => "settlement_count" in row).map((row) => ({
        status: row.status,
        currency: row.currency,
        count: Number(row.settlement_count),
        revenueReceivedPaise: Number(row.revenue_received_paise),
        creatorPayablePaise: Number(row.creator_payable_paise),
        investorPayablePaise: Number(row.investor_payable_paise),
        bridgeSharePaise: Number(row.bridge_share_paise),
      })),
      recentSettlements: settlements.filter((row) => "id" in row).map((row) => ({
        reference: row.id,
        titleName: row.title_name,
        revenueReceivedPaise: Number(row.revenue_received_paise),
        creatorPayablePaise: Number(row.creator_payable_paise),
        investorPayablePaise: Number(row.investor_payable_paise),
        bridgeSharePaise: Number(row.bridge_share_paise),
        currency: row.currency,
        status: row.status,
        settledAt: row.settled_at == null ? null : row.settled_at instanceof Date ? row.settled_at.toISOString() : String(row.settled_at),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
    };
  });
