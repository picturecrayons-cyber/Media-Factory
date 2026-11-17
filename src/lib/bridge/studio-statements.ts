import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";

export type StudioStatementLine = {
  id: string;
  titleId: string;
  titleName: string;
  channelCode: string;
  channelName: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  estimateAmountMinor: number | null;
  reportedGrossMinor: number | null;
  adjustmentsMinor: number;
  netAmountMinor: number | null;
  statementStatus: "ESTIMATED" | "REPORTED" | "RECONCILED" | "DISPUTED" | string;
  statementReference: string | null;
  receivedAt: string | null;
  reconciledAt: string | null;
  paymentStatus: string | null;
  paymentDueAt: string | null;
  paymentPostedAt: string | null;
  paidAmountMinor: number | null;
  paymentReference: string | null;
};

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value: string | Date): string {\n  if (value instanceof Date) return value.toISOString().slice(0, 10);\n  return String(value).slice(0, 10);\n}\n\nfunction isoOrNull(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Owner/admin-only read of statement lines for the server-resolved Studio organization. */
export const listStudioStatements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ statements: StudioStatementLine[] }> => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "studio" || !actor.organizationId) {
      throw new Error("Verified Studio organization access is required");
    }
    const sql = await getSql();
    const managerRows = await sql<{ membership_role: string }>`
      select m.membership_role
      from bridge_organization_memberships m
      join bridge_organizations o on o.id=m.organization_id and o.status='active'
      where m.organization_id=${actor.organizationId}::uuid
        and m.user_id=${actor.userId}
        and m.status='active'
      limit 1
    `;
    if (!["owner", "admin"].includes(managerRows[0]?.membership_role ?? "")) {
      throw new Error("Studio owner or admin membership is required to view financial statements");
    }

    const rows = await sql<{
      id: string;
      title_id: string;
      title_name: string;
      channel_code: string;
      channel_name: string;
      period_start: string | Date;
      period_end: string | Date;
      currency: string;
      estimate_amount_minor: number | string | null;
      reported_gross_minor: number | string | null;
      adjustments_minor: number | string;
      net_amount_minor: number | string | null;
      statement_status: string;
      statement_reference: string | null;
      received_at: string | Date | null;
      reconciled_at: string | Date | null;
      payment_status: string | null;
      payment_due_at: string | Date | null;
      payment_posted_at: string | Date | null;
      paid_amount_minor: number | string | null;
      payment_reference: string | null;
    }>`
      select s.id, s.title_id, t.name as title_name, s.channel_code, s.channel_name,
        s.period_start, s.period_end, s.currency, s.estimate_amount_minor,
        s.reported_gross_minor, s.adjustments_minor, s.net_amount_minor,
        s.statement_status, s.statement_reference, s.received_at, s.reconciled_at,
        p.payment_status, p.payment_due_at, p.payment_posted_at,
        p.paid_amount_minor, p.payment_reference
      from bridge_channel_statement_lines s
      join bridge_titles t on t.id=s.title_id
      left join bridge_channel_payment_schedule p on p.statement_line_id=s.id
      where t.owner_account_type='studio'
        and (
          t.owner_organization_id=${actor.organizationId}::uuid
          or (
            t.owner_organization_id is null
            and exists (
              select 1 from bridge_profiles bp
              where bp.user_id=t.owner_user_id
                and bp.account_type='studio'
                and bp.organization_id=${actor.organizationId}::uuid
            )
          )
        )
      order by s.period_end desc, s.created_at desc
      limit 500
    `;
    return {
      statements: rows.map((row) => ({
        id: row.id,
        titleId: row.title_id,
        titleName: row.title_name,
        channelCode: row.channel_code,
        channelName: row.channel_name,
        periodStart: dateOnly(row.period_start),
        periodEnd: dateOnly(row.period_end),
        currency: row.currency,
        estimateAmountMinor: numberOrNull(row.estimate_amount_minor),
        reportedGrossMinor: numberOrNull(row.reported_gross_minor),
        adjustmentsMinor: numberOrNull(row.adjustments_minor) ?? 0,
        netAmountMinor: numberOrNull(row.net_amount_minor),
        statementStatus: row.statement_status,
        statementReference: row.statement_reference,
        receivedAt: isoOrNull(row.received_at),
        reconciledAt: isoOrNull(row.reconciled_at),
        paymentStatus: row.payment_status,
        paymentDueAt: row.payment_due_at ? dateOnly(row.payment_due_at) : null,
        paymentPostedAt: isoOrNull(row.payment_posted_at),
        paidAmountMinor: numberOrNull(row.paid_amount_minor),
        paymentReference: row.payment_reference,
      })),
    };
  });
