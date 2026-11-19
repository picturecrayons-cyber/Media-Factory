import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "@/lib/bridge/guards";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { canAccessDashboard } from "@/lib/bridge/rbac";

const TRACKED_PRODUCTIONS = [
  { key: "malayalakkara-residency", label: "Malayalakkara Residency" },
  { key: "jananam-1947-pranayam-thudarunnu", label: "Jananam 1947 Pranayam Thudarunnu" },
  { key: "pranayam-1947", label: "Pranayam 1947" },
] as const;

type TrackedTitleRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  owner_display_name: string | null;
  owner_organization_name: string | null;
  credits: Array<{ role: string; name: string }> | null;
};

function titleKey(value: string | null | undefined): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Founder-only read model for the three tracked productions.
 *
 * It queries the canonical title table by exact normalized title/slug rather
 * than relying on listTitles()' recent-200 catalogue window. Ambiguous matches
 * are reported instead of silently selecting an arbitrary record.
 */
export const getFounderTrackedProductions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!canAccessDashboard(actor)) throw new Error("Super admin access required");

    const sql = await getSql();
    const keys = TRACKED_PRODUCTIONS.map((item) => item.key);
    const rows = await sql<TrackedTitleRow>`
      select
        t.id,
        t.slug,
        t.name,
        t.status,
        bp.display_name as owner_display_name,
        bp.organization_name as owner_organization_name,
        t.credits
      from bridge_titles t
      left join bridge_profiles bp on bp.user_id = t.owner_user_id
      where lower(trim(t.slug)) = any(${keys}::text[])
         or regexp_replace(lower(trim(t.name)), '[^a-z0-9]+', '-', 'g') = any(${keys}::text[])
      order by t.updated_at desc
    `;

    return {
      productions: TRACKED_PRODUCTIONS.map((tracked) => {
        const matches = rows.filter(
          (row) => titleKey(row.slug) === tracked.key || titleKey(row.name) === tracked.key,
        );
        const record = matches.length === 1 ? matches[0] : null;
        return {
          ...tracked,
          matchStatus: matches.length === 0 ? "not_found" : matches.length === 1 ? "found" : "ambiguous",
          matchCount: matches.length,
          record: record
            ? {
                id: record.id,
                name: record.name,
                status: record.status,
                ownerDisplayName: record.owner_display_name,
                ownerOrganizationName: record.owner_organization_name,
                credits: Array.isArray(record.credits)
                  ? record.credits.filter(
                      (credit) =>
                        credit &&
                        typeof credit.role === "string" &&
                        typeof credit.name === "string",
                    )
                  : [],
              }
            : null,
        };
      }),
    };
  });


type StatusCount = { status: string; count: number };

export type FounderOperationalSnapshot = {
  payments: { status: string; purpose: string; count: number }[];
  entitlements: number;
  entitlementsByAccessType: { access_type: string; count: number }[];
  licensePackages: { status: string; delivery_status: string; count: number }[];
  packageEntitlements: number;
  qc: StatusCount[];
  legal: StatusCount[];
  rights: StatusCount[];
  distributionPackages: { readiness_state: string; count: number }[];
  loopPublications: { authorization_status: string; count: number }[];
  serviceOrders: StatusCount[];
  titleStatuses: StatusCount[];
  assets: { kind: string; count: number }[];
  assetProcessing: StatusCount[];
  profiles: { account_type: string; internal_role: string; count: number }[];
  organizations: StatusCount[];
  buyerInterest: StatusCount[];
  activeBuyerAccess: number;
  pendingInvites: number;
  cmsRecords: number;
  auditActivity: { action: string; count: number }[];
  webhooks: StatusCount[];
  ingestSessions: StatusCount[];
  ledger: { entry_type: string; classification: string; count: number; amount_paise: number }[];
};

/**
 * Super Admin operational snapshot. Counts and grouped statuses only; no
 * buyer PII, payment identifiers, private asset keys or document URLs.
 */
export const getFounderOperationalSnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!canAccessDashboard(actor)) throw new Error("Super admin access required");

    const sql = await getSql();
    const rows = await sql<{ snapshot: FounderOperationalSnapshot }>`
      select jsonb_build_object(
        'payments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'status', s.status,
            'purpose', s.purpose,
            'count', s.record_count
          ))
          from (
            select status, purpose, count(*)::int as record_count
            from bridge_payments
            group by status, purpose
          ) s
        ), '[]'::jsonb),
        'entitlements', (
          select count(*)::int from bridge_entitlements e
          where e.title_id in (
            select id from bridge_titles
            where coalesce(submission_type, 'finished_film') = 'finished_film'
          )
        ),
        'entitlementsByAccessType', coalesce((
          select jsonb_agg(jsonb_build_object(
            'access_type', s.access_type,
            'count', s.record_count
          ))
          from (
            select e.access_type, count(*)::int as record_count
            from bridge_entitlements e
            where e.title_id in (
              select id from bridge_titles
              where coalesce(submission_type, 'finished_film') = 'finished_film'
            )
            group by e.access_type
          ) s
        ), '[]'::jsonb),
        'licensePackages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'status', s.status,
            'delivery_status', s.delivery_status,
            'count', s.record_count
          ))
          from (
            select p.status, p.delivery_status, count(*)::int as record_count
            from bridge_license_packages p
            where p.title_id in (
              select id from bridge_titles
              where coalesce(submission_type, 'finished_film') = 'finished_film'
            )
            group by p.status, p.delivery_status
          ) s
        ), '[]'::jsonb),
        'packageEntitlements', (
          select count(*)::int from bridge_package_entitlements e
          where e.title_id in (
            select id from bridge_titles
            where coalesce(submission_type, 'finished_film') = 'finished_film'
          )
        ),
        'qc', coalesce((
          select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.record_count))
          from (
            select q.status, count(*)::int as record_count
            from bridge_qc_cases q
            where q.title_id in (
              select id from bridge_titles
              where coalesce(submission_type, 'finished_film') = 'finished_film'
            )
            group by q.status
          ) s
        ), '[]'::jsonb),
        'legal', coalesce((
          select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.record_count))
          from (
            select l.status, count(*)::int as record_count
            from bridge_legal_cases l
            where l.title_id in (
              select id from bridge_titles
              where coalesce(submission_type, 'finished_film') = 'finished_film'
            )
            group by l.status
          ) s
        ), '[]'::jsonb),
        'rights', coalesce((
          select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.record_count))
          from (
            select r.status, count(*)::int as record_count
            from bridge_rights_grants r
            where r.title_id in (
              select id from bridge_titles
              where coalesce(submission_type, 'finished_film') = 'finished_film'
            )
            group by r.status
          ) s
        ), '[]'::jsonb),
        'distributionPackages', coalesce((
          select jsonb_agg(jsonb_build_object('readiness_state', s.readiness_state, 'count', s.record_count))
          from (
            select p.readiness_state, count(*)::int as record_count
            from bridge_destination_packages p
            where p.title_id in (
              select id from bridge_titles
              where coalesce(submission_type, 'finished_film') = 'finished_film'
            )
            group by p.readiness_state
          ) s
        ), '[]'::jsonb),
        'loopPublications', coalesce((
          select jsonb_agg(jsonb_build_object('authorization_status', s.authorization_status, 'count', s.record_count))
          from (
            select p.authorization_status, count(*)::int as record_count
            from bridge_loop_publications p
            where p.bridge_title_id in (
              select id from bridge_titles
              where coalesce(submission_type, 'finished_film') = 'finished_film'
            )
            group by p.authorization_status
          ) s
        ), '[]'::jsonb),
        'serviceOrders', coalesce((
          select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.record_count))
          from (
            select status, count(*)::int as record_count
            from bridge_service_orders
            group by status
          ) s
        ), '[]'::jsonb),
        'titleStatuses', coalesce((
          select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.record_count))
          from (
            select status, count(*)::int as record_count
            from bridge_titles
            where coalesce(submission_type, 'finished_film') = 'finished_film'
            group by status
          ) s
        ), '[]'::jsonb),
        'assets', coalesce((
          select jsonb_agg(jsonb_build_object('kind', s.kind, 'count', s.record_count))
          from (
            select kind, count(*)::int as record_count
            from bridge_assets a
            where a.title_id in (
              select id from bridge_titles
              where coalesce(submission_type, 'finished_film') = 'finished_film'
            )
            group by kind
          ) s
        ), '[]'::jsonb),
        'assetProcessing', coalesce((
          select jsonb_agg(jsonb_build_object('status', s.processing_state, 'count', s.record_count))
          from (
            select av.processing_state, count(*)::int as record_count
            from bridge_asset_versions av
            where av.title_id in (
              select id from bridge_titles
              where coalesce(submission_type, 'finished_film') = 'finished_film'
            )
            group by av.processing_state
          ) s
        ), '[]'::jsonb),
        'profiles', coalesce((
          select jsonb_agg(jsonb_build_object(
            'account_type', s.account_type,
            'internal_role', coalesce(s.internal_role, 'none'),
            'count', s.record_count
          ))
          from (
            select account_type, internal_role, count(*)::int as record_count
            from bridge_profiles
            group by account_type, internal_role
          ) s
        ), '[]'::jsonb),
        'organizations', coalesce((
          select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.record_count))
          from (
            select status, count(*)::int as record_count
            from bridge_organizations
            group by status
          ) s
        ), '[]'::jsonb),
        'buyerInterest', coalesce((
          select jsonb_agg(jsonb_build_object('status', s.interest_level, 'count', s.record_count))
          from (
            select interest_level, count(*)::int as record_count
            from bridge_buyer_interest
            group by interest_level
          ) s
        ), '[]'::jsonb),
        'activeBuyerAccess', (
          select count(*)::int from bridge_buyer_title_access
          where revoked_at is null and (expires_at is null or expires_at > now())
        ),
        'pendingInvites', (
          select count(*)::int from bridge_invites
          where accepted_at is null and expires_at > now()
        ),
        'cmsRecords', (select count(*)::int from bridge_site_content),
        'auditActivity', coalesce((
          select jsonb_agg(jsonb_build_object('action', s.action, 'count', s.record_count))
          from (
            select action, count(*)::int as record_count
            from bridge_audit_logs
            where created_at >= now() - interval '30 days'
            group by action
            order by count(*) desc
            limit 8
          ) s
        ), '[]'::jsonb),
        'webhooks', coalesce((
          select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.record_count))
          from (
            select status, count(*)::int as record_count
            from bridge_webhook_events
            group by status
          ) s
        ), '[]'::jsonb),
        'ingestSessions', coalesce((
          select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.record_count))
          from (
            select status, count(*)::int as record_count
            from bridge_dit_ingest_sessions
            group by status
          ) s
        ), '[]'::jsonb),
        'ledger', coalesce((
          select jsonb_agg(jsonb_build_object(
            'entry_type', s.entry_type,
            'classification', s.classification,
            'count', s.record_count,
            'amount_paise', s.total_paise
          ))
          from (
            select entry_type, classification, count(*)::int as record_count,
              coalesce(sum(amount_paise), 0)::bigint as total_paise
            from bridge_financial_ledger
            group by entry_type, classification
          ) s
        ), '[]'::jsonb)
      ) as snapshot
    `;
    return rows[0]?.snapshot ?? {
      payments: [],
      entitlements: 0,
      entitlementsByAccessType: [],
      licensePackages: [],
      packageEntitlements: 0,
      qc: [],
      legal: [],
      rights: [],
      distributionPackages: [],
      loopPublications: [],
      serviceOrders: [],
      titleStatuses: [],
      assets: [],
      assetProcessing: [],
      profiles: [],
      organizations: [],
      buyerInterest: [],
      activeBuyerAccess: 0,
      pendingInvites: 0,
      cmsRecords: 0,
      auditActivity: [],
      webhooks: [],
      ingestSessions: [],
      ledger: [],
    };
  });
