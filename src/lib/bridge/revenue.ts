import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { z } from "zod";
import { writeAudit } from "./audit";
import { assertFullSettlementAmount, computeReportedNetMinor } from "./revenue-accounting";

type RevenueRow = {
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
  statement_status: "ESTIMATED" | "REPORTED" | "RECONCILED" | "DISPUTED";
  statement_reference: string | null;
  received_at: string | Date | null;
  estimate_available_at: string | Date | null;
  payment_due_at: string | Date | null;
  payment_posted_at: string | Date | null;
  paid_amount_minor: number | string | null;
  payment_reference: string | null;
  payment_status: "SCHEDULED" | "PAYMENT_PENDING" | "PAID" | "OVERDUE" | "DISPUTED" | null;
};

function asDate(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function asMinor(value: number | string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export const getRevenueDashboard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);

    if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") {
      throw new Error("Revenue workspace is available only to verified Studio and Creator accounts");
    }
    assertPermission(actor, "delivery.read_finance");

    const sql = await getSql();
    const rows = await sql<RevenueRow>`
      select
        s.id,
        s.title_id,
        t.name as title_name,
        s.channel_code,
        s.channel_name,
        s.period_start,
        s.period_end,
        s.currency,
        s.estimate_amount_minor,
        s.reported_gross_minor,
        s.adjustments_minor,
        s.net_amount_minor,
        s.statement_status,
        s.statement_reference,
        s.received_at,
        p.estimate_available_at,
        p.payment_due_at,
        p.payment_posted_at,
        p.paid_amount_minor,
        p.payment_reference,
        p.payment_status
      from public.bridge_channel_statement_lines s
      join public.bridge_titles t on t.id = s.title_id
      left join public.bridge_channel_payment_schedule p on p.statement_line_id = s.id
      where
        t.owner_user_id = ${actor.userId}
        or (
          ${actor.accountType === "studio"}
          and ${actor.organizationId ?? null}::uuid is not null
          and t.owner_organization_id = ${actor.organizationId ?? null}::uuid
        )
      order by s.period_end desc, s.created_at desc
      limit 250
    `;

    return {
      lines: rows.map((row) => ({
        id: row.id,
        titleId: row.title_id,
        titleName: row.title_name,
        channelCode: row.channel_code,
        channelName: row.channel_name,
        periodStart: asDate(row.period_start)!,
        periodEnd: asDate(row.period_end)!,
        currency: row.currency,
        estimateAmountMinor: asMinor(row.estimate_amount_minor),
        reportedGrossMinor: asMinor(row.reported_gross_minor),
        adjustmentsMinor: asMinor(row.adjustments_minor) ?? 0,
        netAmountMinor: asMinor(row.net_amount_minor),
        statementStatus: row.statement_status,
        statementReference: row.statement_reference,
        receivedAt: asDate(row.received_at),
        estimateAvailableAt: asDate(row.estimate_available_at),
        paymentDueAt: asDate(row.payment_due_at),
        paymentPostedAt: asDate(row.payment_posted_at),
        paidAmountMinor: asMinor(row.paid_amount_minor),
        paymentReference: row.payment_reference,
        paymentStatus: row.payment_status,
      })),
    };
  });

const recordStatementSchema = z.object({
  titleId: z.string().min(8).max(128),
  channelCode: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/),
  channelName: z.string().trim().min(2).max(120),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("INR"),
  estimateAmountMinor: z.number().int().nonnegative().safe().nullable().optional(),
  reportedGrossMinor: z.number().int().nonnegative().safe().nullable().optional(),
  adjustmentsMinor: z.number().int().safe().default(0),
  statementReference: z.string().trim().max(160).nullable().optional(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  receivedAt: z.string().datetime().nullable().optional(),
  estimateAvailableAt: z.string().date().nullable().optional(),
  paymentDueAt: z.string().date().nullable().optional(),
}).refine((value) => value.estimateAmountMinor != null || value.reportedGrossMinor != null, {
  message: "A statement must contain an estimate or a reported gross amount",
  path: ["reportedGrossMinor"],
}).refine((value) => value.periodEnd >= value.periodStart, {
  message: "Statement period end must not precede its start",
  path: ["periodEnd"],
});

export const recordChannelStatement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(recordStatementSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.record_settlement");

    const netAmountMinor = computeReportedNetMinor(data.reportedGrossMinor, data.adjustmentsMinor);
    const sql = await getSql();

    const result = await sql.transaction(async (tx) => {
      const title = await tx<{ id: string }>`
        select id from public.bridge_titles where id = ${data.titleId} limit 1
      `;
      if (!title[0]) throw new Error("Title not found");

      const inserted = await tx<{ id: string }>`
        insert into public.bridge_channel_statement_lines (
          title_id, channel_code, channel_name, period_start, period_end, currency,
          estimate_amount_minor, reported_gross_minor, adjustments_minor, net_amount_minor,
          statement_status, statement_reference, source_hash, received_at, created_by
        ) values (
          ${data.titleId}, ${data.channelCode}, ${data.channelName}, ${data.periodStart},
          ${data.periodEnd}, ${data.currency}, ${data.estimateAmountMinor ?? null},
          ${data.reportedGrossMinor ?? null}, ${data.adjustmentsMinor}, ${netAmountMinor},
          ${data.reportedGrossMinor == null ? "ESTIMATED" : "REPORTED"},
          ${data.statementReference ?? null}, ${data.sourceHash},
          ${data.receivedAt ?? null}, ${actor.userId}
        )
        returning id
      `;
      if (!inserted[0]) throw new Error("Statement could not be recorded");

      if (data.estimateAvailableAt || data.paymentDueAt) {
        await tx`
          insert into public.bridge_channel_payment_schedule (
            statement_line_id, estimate_available_at, payment_due_at, payment_status
          ) values (
            ${inserted[0].id}, ${data.estimateAvailableAt ?? null},
            ${data.paymentDueAt ?? null}, 'SCHEDULED'
          )
        `;
      }

      await writeAudit({
        actorUserId: actor.userId,
        action: "channel_statement.recorded",
        entityType: "bridge_channel_statement_line",
        entityId: inserted[0].id,
        metadata: {
          titleId: data.titleId,
          channelCode: data.channelCode,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          statementStatus: data.reportedGrossMinor == null ? "ESTIMATED" : "REPORTED",
        },
      }, tx);

      return { id: inserted[0].id };
    });

    return { statementLineId: result.id, status: "RECORDED" as const };
  });

const recordPaymentSchema = z.object({
  statementLineId: z.string().uuid(),
  paidAmountMinor: z.number().int().positive().safe(),
  paymentReference: z.string().trim().min(3).max(160),
  paymentPostedAt: z.string().datetime().optional(),
});

export const recordChannelPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(recordPaymentSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.record_settlement");
    const sql = await getSql();
    const reconciled = await sql<{ net_amount_minor: number | string | null; statement_status: string }>`
      select net_amount_minor, statement_status
      from public.bridge_channel_statement_lines
      where id = ${data.statementLineId}
      limit 1
    `;
    const netAmount = reconciled[0]?.statement_status === "RECONCILED" && reconciled[0].net_amount_minor != null
      ? Number(reconciled[0].net_amount_minor)
      : null;
    assertFullSettlementAmount(data.paidAmountMinor, Number.isSafeInteger(netAmount) ? netAmount : null);

    return sql.transaction(async (tx) => {
      const updated = await tx<{ id: string }>`
        update public.bridge_channel_payment_schedule
        set payment_status = 'PAID',
            paid_amount_minor = ${data.paidAmountMinor},
            payment_reference = ${data.paymentReference},
            payment_posted_at = ${data.paymentPostedAt ?? new Date().toISOString()},
            updated_at = now()
        where statement_line_id = ${data.statementLineId}
          and payment_status <> 'PAID'
          and exists (
            select 1 from public.bridge_channel_statement_lines s
            where s.id = ${data.statementLineId}
              and s.statement_status = 'RECONCILED'
              and s.net_amount_minor = ${data.paidAmountMinor}
          )
        returning id
      `;
      if (!updated[0]) throw new Error("Payment schedule not found or already marked paid");

      await writeAudit({
        actorUserId: actor.userId,
        action: "channel_payment.recorded",
        entityType: "bridge_channel_payment_schedule",
        entityId: updated[0].id,
        metadata: {
          statementLineId: data.statementLineId,
          paidAmountMinor: data.paidAmountMinor,
          paymentReference: data.paymentReference,
        },
      }, tx);

      return { paymentScheduleId: updated[0].id, status: "PAID" as const };
    });
  });

export const reconcileChannelStatement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ statementLineId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.record_settlement");
    const sql = await getSql();

    return sql.transaction(async (tx) => {
      const rows = await tx<{ id: string }>`
        update public.bridge_channel_statement_lines
        set statement_status = 'RECONCILED', reconciled_at = now(), updated_at = now()
        where id = ${data.statementLineId} and statement_status = 'REPORTED'
        returning id
      `;
      if (!rows[0]) throw new Error("Only a reported statement can be reconciled");
      await writeAudit({
        actorUserId: actor.userId,
        action: "channel_statement.reconciled",
        entityType: "bridge_channel_statement_line",
        entityId: rows[0].id,
      }, tx);
      return { statementLineId: rows[0].id, status: "RECONCILED" as const };
    });
  });
