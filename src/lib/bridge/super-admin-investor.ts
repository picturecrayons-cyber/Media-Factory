import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";

/** Read-only mapping of existing title-investor records; no investor or title assignments are changed. */
export const listSuperAdminInvestorGovernance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Super Admin access required");
    }

    const sql = await getSql();
    const [summary, records] = await Promise.all([
      sql<{
        title_count: number | string;
        record_count: number | string;
        linked_count: number | string;
        unlinked_count: number | string;
        total_capital_paise: number | string;
      }>`
        select count(distinct title_id)::int as title_count,
               count(*)::int as record_count,
               count(*) filter (where investor_user_id is not null)::int as linked_count,
               count(*) filter (where investor_user_id is null)::int as unlinked_count,
               coalesce(sum(invested_amount_paise), 0)::bigint as total_capital_paise
        from bridge_title_investors
      `,
      sql<{
        id: string;
        title_id: string;
        title_name: string;
        investor_name: string;
        investor_display_name: string | null;
        linked: boolean;
        investment_reference: string | null;
        invested_amount_paise: number | string | null;
        currency: string;
        participation_percent: number | string | null;
        created_at: string | Date;
      }>`
        select i.id, i.title_id, t.name as title_name, i.investor_name,
               bp.display_name as investor_display_name,
               (i.investor_user_id is not null) as linked,
               i.investment_reference, i.invested_amount_paise, i.currency,
               i.participation_percent, i.created_at
        from bridge_title_investors i
        join bridge_titles t on t.id = i.title_id
        left join bridge_profiles bp on bp.user_id = i.investor_user_id
        order by i.created_at desc
        limit 200
      `,
    ]);

    const totals = summary[0];
    return {
      summary: totals ? {
        titleCount: Number(totals.title_count),
        recordCount: Number(totals.record_count),
        linkedCount: Number(totals.linked_count),
        unlinkedCount: Number(totals.unlinked_count),
        totalCapitalPaise: Number(totals.total_capital_paise),
      } : null,
      records: records.map((row) => ({
        reference: row.id,
        titleId: row.title_id,
        titleName: row.title_name,
        investorName: row.investor_name,
        linkedDisplayName: row.investor_display_name,
        linked: row.linked,
        investmentReference: row.investment_reference,
        investedAmountPaise: row.invested_amount_paise == null ? null : Number(row.invested_amount_paise),
        currency: row.currency,
        participationPercent: row.participation_percent == null ? null : Number(row.participation_percent),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
      limit: 200,
    };
  });
