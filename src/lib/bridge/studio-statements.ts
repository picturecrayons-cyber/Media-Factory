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
  estimateAmountMinor: string | null;
  reportedGrossMinor: string | null;
  adjustmentsMinor: string | null;
  netAmountMinor: string | null;
  statementStatus: "ESTIMATED" | "REPORTED" | "RECONCILED" | "DISPUTED" | string;
  statementReference: string | null;
  receivedAt: string | null;
  reconciledAt: string | null;
  paymentStatus: string | null;
  paymentDueAt: string | null;
  paymentPostedAt: string | null;
  paidAmountMinor: string | null;
  paymentReference: string | null;
};

function minorAmountOrNull(value: string | null): string | null {
  if (value === null || !/^-?\d+$/.test(value)) return null;
  try { return BigInt(value).toString(); } catch { return null; }
}

function dateOnly(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoOrNull(value: string | Date | null): string | null {
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
      estimate_amount_minor: string | null;
      reported_gross_minor: string | null;
      adjustments_minor: string;
      net_amount_minor: string | null;
      statement_status: string;
      statement_reference: string | null;
      received_at: string | Date | null;
      reconciled_at: string | Date | null;
      payment_status: string | null;
      payment_due_at: string | Date | null;
      payment_posted_at: string | Date | null;
      paid_amount_minor: string | null;
      payment_reference: string | null;
    }>`
      select s.id, s.title_id, t.name as title_name, s.channel_code, s.channel_name,
        s.period_start, s.period_end, s.currency, s.estimate_amount_minor::text as estimate_amount_minor,
        s.reported_gross_minor::text as reported_gross_minor, s.adjustments_minor::text as adjustments_minor,
        s.net_amount_minor::text as net_amount_minor,
        s.statement_status, s.statement_reference, s.received_at, s.reconciled_at,
        p.payment_status, p.payment_due_at, p.payment_posted_at,
        p.paid_amount_minor::text as paid_amount_minor, p.payment_reference
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
        estimateAmountMinor: minorAmountOrNull(row.estimate_amount_minor),
        reportedGrossMinor: minorAmountOrNull(row.reported_gross_minor),
        adjustmentsMinor: minorAmountOrNull(row.adjustments_minor),
        netAmountMinor: minorAmountOrNull(row.net_amount_minor),
        statementStatus: row.statement_status,
        statementReference: row.statement_reference,
        receivedAt: isoOrNull(row.received_at),
        reconciledAt: isoOrNull(row.reconciled_at),
        paymentStatus: row.payment_status,
        paymentDueAt: row.payment_due_at ? dateOnly(row.payment_due_at) : null,
        paymentPostedAt: isoOrNull(row.payment_posted_at),
        paidAmountMinor: minorAmountOrNull(row.paid_amount_minor),
        paymentReference: row.payment_reference,
      })),
    };
  });


export type StudioFinancialActivity = {
  id: string;
  source: "PAYMENT" | "LEDGER" | "SERVICE_SETTLEMENT";
  titleId: string;
  titleName: string;
  category: string;
  status: string;
  amountMinor: string | null;
  currency: string;
  reference: string | null;
  occurredAt: string | null;
  note: string;
};

/**
 * Owner/admin-only, read-only view of existing commercial activity.
 * This is not bank reconciliation and must never promote a payment or
 * settlement status into independent cash-settlement evidence.
 */
export const listStudioFinancialActivity = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ activity: StudioFinancialActivity[] }> => {
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
      throw new Error("Studio owner or admin membership is required to view financial activity");
    }

    const ownership = sql`
      (
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
    `;

    const [paymentRows, ledgerRows, settlementRows] = await Promise.all([
      sql<{
        id: string; title_id: string; title_name: string; purpose: string;
        provider: string; provider_order_id: string | null; provider_payment_id: string | null;
        amount_paise: string; currency: string; status: string;
        verified_at: string | Date | null; created_at: string | Date;
        provider_fee_paise: string | null; provider_tax_paise: string | null;
        refunded_amount_paise: string; chargeback_amount_paise: string;
      }>`
        select p.id, p.title_id, t.name as title_name, p.purpose, p.provider,
          p.provider_order_id, p.provider_payment_id, p.amount_paise::text as amount_paise, p.currency,
          p.status, p.verified_at, p.created_at, p.provider_fee_paise::text as provider_fee_paise,
          p.provider_tax_paise::text as provider_tax_paise,
          p.refunded_amount_paise::text as refunded_amount_paise,
          p.chargeback_amount_paise::text as chargeback_amount_paise
        from bridge_payments p
        join bridge_titles t on t.id=p.title_id
        where ${ownership}
        order by p.created_at desc
        limit 250
      `,
      sql<{
        id: string; title_id: string; title_name: string; entry_type: string;
        classification: string; amount_paise: string; currency: string;
        reference: string | null; source_event_id: string | null; created_at: string | Date;
      }>`
        select l.id::text as id, l.title_id, t.name as title_name,
          l.entry_type, l.classification, l.amount_paise::text as amount_paise, l.currency,
          l.reference, l.source_event_id, l.created_at
        from bridge_financial_ledger l
        join bridge_titles t on t.id=l.title_id
        where ${ownership}
        order by l.created_at desc
        limit 500
      `,
      sql<{
        id: string; title_id: string; title_name: string; beneficiary_type: string;
        basis: string; amount_paise: string; status: string;
        paid_at: string | Date | null; created_at: string | Date;
      }>`
        select s.id::text as id, so.title_id, t.name as title_name,
          s.beneficiary_type, s.basis, s.amount_paise::text as amount_paise, s.status, s.paid_at, s.created_at
        from bridge_service_settlement_lines s
        join bridge_service_orders so on so.id=s.order_id
        join bridge_titles t on t.id=so.title_id
        where ${ownership}
        order by s.created_at desc
        limit 250
      `,
    ]);

    const iso = (value: string | Date | null) => {
      if (!value) return null;
      const parsed = value instanceof Date ? value : new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    };
    const money = (value: string | null) => minorAmountOrNull(value);

    const activity: StudioFinancialActivity[] = [
      ...paymentRows.map((row) => ({
        id: row.id,
        source: "PAYMENT" as const,
        titleId: row.title_id,
        titleName: row.title_name,
        category: `${row.provider} · ${row.purpose}`,
        status: row.status,
        amountMinor: money(row.amount_paise),
        currency: row.currency,
        reference: row.provider_payment_id ?? row.provider_order_id,
        occurredAt: iso(row.verified_at) ?? iso(row.created_at),
        note: [
          row.verified_at ? "Provider payment verification timestamp recorded." : "No provider verification timestamp recorded.",
          `Provider fee: ${money(row.provider_fee_paise) ?? "Unavailable"} paise.`,
          `Provider tax: ${money(row.provider_tax_paise) ?? "Unavailable"} paise.`,
          `Refunded: ${money(row.refunded_amount_paise) ?? "Unavailable"} paise; chargeback: ${money(row.chargeback_amount_paise) ?? "Unavailable"} paise.`,
          "Provider status is not independent bank reconciliation.",
        ].join(" "),
      })),
      ...ledgerRows.map((row) => ({
        id: row.id,
        source: "LEDGER" as const,
        titleId: row.title_id,
        titleName: row.title_name,
        category: `${row.entry_type} · ${row.classification}`,
        status: "RECORDED",
        amountMinor: money(row.amount_paise),
        currency: row.currency,
        reference: row.reference ?? row.source_event_id,
        occurredAt: iso(row.created_at),
        note: "Existing server-side financial ledger entry. No bank statement match is implied.",
      })),
      ...settlementRows.map((row) => ({
        id: row.id,
        source: "SERVICE_SETTLEMENT" as const,
        titleId: row.title_id,
        titleName: row.title_name,
        category: `Settlement · ${row.beneficiary_type} · ${row.basis}`,
        status: row.status,
        amountMinor: money(row.amount_paise),
        currency: "INR",
        reference: null,
        occurredAt: iso(row.paid_at) ?? iso(row.created_at),
        note: row.paid_at
          ? "Application settlement line has a paid_at timestamp; independent bank confirmation is not connected."
          : "Contractual settlement line only; no settlement payment confirmation recorded.",
      })),
    ];
    activity.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
    return { activity };
  });
