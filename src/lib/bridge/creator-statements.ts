import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";

export type CreatorStatementLine = {
  id: string;
  titleId: string;
  titleName: string;
  basis: string;
  percentageBps: number | null;
  amountPaise: number;
  currency: string;
  status: "PENDING" | "ON_HOLD" | "APPROVED" | "PAID" | "CANCELLED" | string;
  createdAt: string;
  paidAt: string | null;
  orderReference: string;
};

/**
 * Read-only creator-payable statement feed.
 * Only explicit CREATOR settlement allocations assigned to this verified
 * Creator identity are shown; title licensing prices and Studio settlements
 * are never inferred as creator earnings.
 */
export const listOwnCreatorStatements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ statements: CreatorStatementLine[] }> => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "independent_creator") {
      throw new Error("Verified independent Creator account required");
    }

    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title_id: string;
      title_name: string;
      basis: string;
      percentage_bps: number | null;
      amount_paise: number | string;
      currency: string;
      status: string;
      created_at: string | Date;
      paid_at: string | Date | null;
      order_reference: string;
    }>`
      select
        s.id::text as id,
        t.id as title_id,
        t.name as title_name,
        s.basis,
        s.percentage_bps,
        s.amount_paise,
        o.currency,
        s.status,
        s.created_at,
        s.paid_at,
        o.id::text as order_reference
      from bridge_service_settlement_lines s
      join bridge_service_orders o on o.id = s.order_id
      join bridge_titles t on t.id = o.title_id
      where s.beneficiary_type = 'CREATOR'
        and s.beneficiary_user_id = ${actor.userId}
        and t.owner_user_id = ${actor.userId}
        and t.owner_account_type = 'independent_creator'
      order by s.created_at desc, s.id desc
      limit 500
    `;

    const iso = (value: string | Date | null) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    };

    return {
      statements: rows.map((row) => ({
        id: row.id,
        titleId: row.title_id,
        titleName: row.title_name,
        basis: row.basis,
        percentageBps: row.percentage_bps,
        amountPaise: Number(row.amount_paise),
        currency: row.currency,
        status: row.status,
        createdAt: iso(row.created_at) ?? "",
        paidAt: iso(row.paid_at),
        orderReference: row.order_reference,
      })),
    };
  });
