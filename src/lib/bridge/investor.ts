import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";

export const listInvestorInvestments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "investor" || actor.internalRole) {
      throw new Error("Investor access required");
    }

    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title_id: string;
      title_name: string;
      investment_reference: string | null;
      invested_amount_paise: number | string | null;
      participation_percent: number | string | null;
      created_at: string | Date;
    }>`
      select i.id, i.title_id, t.name as title_name, i.investment_reference,
             i.invested_amount_paise, i.participation_percent, i.created_at
      from bridge_title_investors i
      join bridge_titles t on t.id = i.title_id
      where i.investor_user_id = ${actor.userId}
      order by i.created_at desc
      limit 200
    `;

    return {
      investments: rows.map((row) => ({
        id: row.id,
        titleId: row.title_id,
        titleName: row.title_name,
        investmentReference: row.investment_reference,
        investedAmountPaise: row.invested_amount_paise,
        participationPercent: row.participation_percent,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
    };
  });
