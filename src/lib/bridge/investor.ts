import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { requireVerifiedActor } from "./session";

export type InvestorInvestment = {
  id: string;
  titleId: string;
  titleName: string;
  investmentReference: string | null;
  investedAmountPaise: number | string | null;
  participationPercent: number | string | null;
  createdAt: string;
};

export async function listInvestorInvestments(
  sql: Pick<Sql, "query">,
  investorUserId: string,
): Promise<{ investments: InvestorInvestment[] }> {
  if (!investorUserId.trim()) throw new Error("Investor identity required");
  const rows = await sql.query<{
    id: string;
    title_id: string;
    title_name: string;
    investment_reference: string | null;
    invested_amount_paise: number | string | null;
    participation_percent: number | string | null;
    created_at: string | Date;
  }>(
    `select i.id, i.title_id, t.name as title_name, i.investment_reference,
            i.invested_amount_paise, i.participation_percent, i.created_at
     from bridge_title_investors i
     join bridge_titles t on t.id = i.title_id
     where i.investor_user_id = $1
     order by i.created_at desc
     limit 200`,
    [investorUserId],
  );
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
}

export const getOwnInvestorInvestments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "investor") throw new Error("Forbidden");
    return listInvestorInvestments(await getSql(), actor.userId);
  });
