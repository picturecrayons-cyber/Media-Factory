import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";

export type CreatorRoyaltyRecord = {
  id: string;
  titleId: string;
  titleName: string;
  revenueReceivedMinor: string;
  creatorPayableMinor: string;
  currency: string;
  status: "PENDING" | "PARTIAL" | "SETTLED" | "ON_HOLD" | string;
  evidenceCount: number | null;
  recordedAt: string;
  settledAt: string | null;
};

function toIso(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Read-only Creator royalty/settlement view.
 * Only settlement rows attached to titles owned by the authenticated Creator
 * are returned. A SETTLED application status is not represented as bank proof.
 */
export const listCreatorRoyalties = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ records: CreatorRoyaltyRecord[] }> => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "independent_creator") {
      throw new Error("Verified Creator account access is required");
    }

    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title_id: string;
      title_name: string;
      revenue_received_minor: string | number;
      creator_payable_minor: string | number;
      currency: string;
      status: string;
      evidence: unknown;
      created_at: string | Date;
      settled_at: string | Date | null;
    }>`
      select s.id::text as id, s.title_id, t.name as title_name,
        s.revenue_received_paise::text as revenue_received_minor,
        s.creator_payable_paise::text as creator_payable_minor,
        s.currency, s.status, s.evidence, s.created_at, s.settled_at
      from bridge_title_settlements s
      join bridge_titles t on t.id = s.title_id
      where t.owner_user_id = ${actor.userId}
        and t.owner_account_type = 'independent_creator'
      order by s.created_at desc, s.id desc
      limit 500
    `;

    return {
      records: rows.map((row) => ({
        id: row.id,
        titleId: row.title_id,
        titleName: row.title_name,
        revenueReceivedMinor: String(row.revenue_received_minor),
        creatorPayableMinor: String(row.creator_payable_minor),
        currency: row.currency,
        status: row.status,
        evidenceCount: Array.isArray(row.evidence) ? row.evidence.length : null,
        recordedAt: toIso(row.created_at) ?? "",
        settledAt: toIso(row.settled_at),
      })),
    };
  });
