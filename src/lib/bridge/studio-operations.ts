import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { assertPermission } from "./rbac";

export type StudioProductionRow = {
  id: string;
  name: string;
  language: string;
  year: number | null;
  status: string;
  qcStatus: string;
  legalStatus: string;
  ottStatus: string;
  packagingStatus: string;
  curationStatus: string;
  deliveryStatus: string;
  updatedAt: string;
};

export type StudioScheduleRow = {
  id: string;
  titleId: string;
  titleName: string;
  eventType: string;
  eventName: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  status: string;
};

export type StudioStatementRow = {
  id: string;
  titleId: string;
  titleName: string;
  channelName: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  reportedGrossMinor: number | null;
  adjustmentsMinor: number;
  netAmountMinor: number | null;
  statementStatus: string;
  statementReference: string | null;
  reconciledAt: string | null;
};

/** Read-only, organization-scoped Studio operations snapshot. */
export const listStudioOperations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "studio" || !actor.organizationId) {
      throw new Error("Verified Studio organization access is required");
    }
    assertPermission(actor, "title.read_own");
    assertPermission(actor, "delivery.read_finance");

    const sql = await getSql();
    const memberships = await sql<{ membership_role: string }>`
      select membership_role
      from bridge_organization_memberships
      where organization_id = ${actor.organizationId}::uuid
        and user_id = ${actor.userId}
        and status = 'active'
      limit 1
    `;
    if (!memberships[0]) throw new Error("An active Studio organization membership is required");

    const productions = await sql<{
      id: string; name: string; language: string; year: number | null; status: string;
      qc_status: string; legal_status: string; ott_status: string; packaging_status: string;
      curation_status: string; delivery_status: string; updated_at: string | Date;
    }>`
      select
        t.id, t.name, t.language, t.year, t.status,
        coalesce(q.status, 'NOT_STARTED') as qc_status,
        coalesce(l.status, 'NOT_STARTED') as legal_status,
        coalesce(g.ott_preparation_status, 'NOT_RECORDED') as ott_status,
        coalesce(g.packaging_status, 'NOT_RECORDED') as packaging_status,
        coalesce(g.curation_status, 'NOT_RECORDED') as curation_status,
        coalesce(g.delivery_status, 'NOT_RECORDED') as delivery_status,
        t.updated_at
      from bridge_titles t
      left join lateral (
        select status from bridge_qc_cases
        where title_id = t.id order by created_at desc limit 1
      ) q on true
      left join lateral (
        select status from bridge_legal_cases
        where title_id = t.id order by created_at desc limit 1
      ) l on true
      left join bridge_title_gate_certifications g on g.title_id = t.id
      where t.submission_type = 'finished_film'
        and coalesce(to_jsonb(t)->>'merged_into_title_id', '') = ''
        and (
          t.owner_user_id = ${actor.userId}
          or (
            t.owner_account_type = 'studio'
            and (
              t.owner_organization_id = ${actor.organizationId}::uuid
              or (
                t.owner_organization_id is null
                and exists (
                  select 1 from bridge_profiles p
                  where p.user_id = t.owner_user_id
                    and p.account_type = 'studio'
                    and p.organization_id = ${actor.organizationId}::uuid
                )
              )
            )
          )
        )
      order by t.updated_at desc
      limit 200
    `;

    const titleIds = productions.map((row) => row.id);
    // These modules are present in the isolated Testing schema but are not
    // yet part of the canonical Production schema. Detect capability rather
    // than issuing queries that would turn the whole Studio dashboard into
    // HTTP 500; never create a Production table from this read model.
    const capabilities = await sql<{
      schedule: boolean;
      statements: boolean;
    }>`
      select
        to_regclass('public.bridge_production_schedule_events') is not null as schedule,
        to_regclass('public.bridge_channel_statement_lines') is not null as statements
    `;
    const scheduleAvailable = capabilities[0]?.schedule === true;
    const statementsAvailable = capabilities[0]?.statements === true;

    const schedule = titleIds.length && scheduleAvailable
      ? await sql<{
          id: string; title_id: string; title_name: string; event_type: string;
          event_name: string; starts_at: string | Date; ends_at: string | Date;
          location: string | null; status: string;
        }>`
          select e.id, e.title_id, t.name as title_name, e.event_type, e.event_name,
            e.starts_at, e.ends_at, e.location, e.status
          from bridge_production_schedule_events e
          join bridge_titles t on t.id = e.title_id
          where e.organization_id = ${actor.organizationId}::uuid
            and e.title_id = any(${titleIds}::text[])
          order by e.starts_at asc
          limit 200
        `
      : [];

    const statements = titleIds.length && statementsAvailable
      ? await sql<{
          id: string; title_id: string; title_name: string; channel_name: string;
          period_start: string | Date; period_end: string | Date; currency: string;
          reported_gross_minor: number | null; adjustments_minor: number;
          net_amount_minor: number | null; statement_status: string;
          statement_reference: string | null; reconciled_at: string | Date | null;
        }>`
          select s.id, s.title_id, t.name as title_name, s.channel_name,
            s.period_start, s.period_end, s.currency, s.reported_gross_minor,
            s.adjustments_minor, s.net_amount_minor, s.statement_status,
            s.statement_reference, s.reconciled_at
          from bridge_channel_statement_lines s
          join bridge_titles t on t.id = s.title_id
          where s.title_id = any(${titleIds}::text[])
          order by s.period_end desc, s.created_at desc
          limit 200
        `
      : [];

    const iso = (value: string | Date | null) =>
      value == null ? null : value instanceof Date ? value.toISOString() : String(value);

    return {
      organizationId: actor.organizationId,
      capabilities: { schedule: scheduleAvailable, statements: statementsAvailable },
      productions: productions.map((row): StudioProductionRow => ({
        id: row.id, name: row.name, language: row.language, year: row.year,
        status: row.status, qcStatus: row.qc_status, legalStatus: row.legal_status,
        ottStatus: row.ott_status, packagingStatus: row.packaging_status,
        curationStatus: row.curation_status, deliveryStatus: row.delivery_status,
        updatedAt: iso(row.updated_at)!,
      })),
      schedule: schedule.map((row): StudioScheduleRow => ({
        id: row.id, titleId: row.title_id, titleName: row.title_name,
        eventType: row.event_type, eventName: row.event_name,
        startsAt: iso(row.starts_at)!, endsAt: iso(row.ends_at)!,
        location: row.location, status: row.status,
      })),
      statements: statements.map((row): StudioStatementRow => ({
        id: row.id, titleId: row.title_id, titleName: row.title_name,
        channelName: row.channel_name, periodStart: iso(row.period_start)!,
        periodEnd: iso(row.period_end)!, currency: row.currency,
        reportedGrossMinor: row.reported_gross_minor,
        adjustmentsMinor: Number(row.adjustments_minor),
        netAmountMinor: row.net_amount_minor, statementStatus: row.statement_status,
        statementReference: row.statement_reference, reconciledAt: iso(row.reconciled_at),
      })),
    };
  });
