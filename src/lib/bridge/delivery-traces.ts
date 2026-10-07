import type { Sql } from "../db.ts";
import type { Actor } from "./rbac.ts";
import { assertPermission, hasPermission } from "./rbac.ts";
import { assertNotDevUser } from "./guards.ts";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type DeliveryTrace = {
  titleId: string;
  titleName: string;
  language: string;
  year: number | null;
  creator: string;
  destinations: Array<{
    id: string;
    buyer: string;
    state: string;
    territories: JsonValue;
    languages: JsonValue;
    media: JsonValue;
    windowStart: string | null;
    windowEnd: string | null;
    commercialModel: string;
    distributorExclusivity: string;
    revenueSharePercent: number | null;
  }>;
  investorCount: number;
  settlementStatus: string | null;
};

type DeliveryRow = {
  title_id: string;
  title_name: string;
  language: string;
  year: number | null;
  creator: string;
  investor_count: number;
  settlement_status: string | null;
  destinations: DeliveryTrace["destinations"];
};

/** Server read model; permissions are checked before acquiring the SQL client. */
export async function readDeliveryTraces(
  actor: Actor,
  getSql: () => Promise<Sql>,
): Promise<{ deliveries: DeliveryTrace[] }> {
  assertNotDevUser(actor.userId);
  const isInternal = Boolean(actor.internalRole);
  const isFinanceViewer =
    isInternal &&
    hasPermission(actor, "finance.read") &&
    hasPermission(actor, "delivery.read_finance");
  const canReadOwnFinance = !isInternal && hasPermission(actor, "delivery.read_finance");

  assertPermission(actor, "delivery.read");
  // Title access never establishes authorization to another buyer's packages.
  if (!isInternal && actor.accountType === "buyer") throw new Error("Forbidden");
  if (isInternal) assertPermission(actor, "title.read_catalog");
  else assertPermission(actor, "title.read_own");

  const sql = await getSql();
  const rows = await sql<DeliveryRow>`
      select
        t.id as title_id,
        t.name as title_name,
        t.language,
        t.year,
        coalesce(nullif(p.organization_name, ''), nullif(p.display_name, ''), t.owner_user_id) as creator,
        coalesce(i.investor_count, 0)::int as investor_count,
        case when (${isFinanceViewer} or (${canReadOwnFinance} and t.owner_user_id = ${actor.userId})) then s.settlement_status else null end as settlement_status,
        coalesce(d.destinations, '[]'::jsonb) as destinations
      from bridge_titles t
      left join bridge_profiles p on p.user_id = t.owner_user_id
      left join lateral (
        select count(*)::int as investor_count
        from bridge_title_investors bi
        where bi.title_id = t.id
      ) i on true
      left join lateral (
        select case
          when bool_or(bs.status = 'ON_HOLD') then 'ON_HOLD'
          when count(*) > 0 and bool_and(bs.status = 'SETTLED') then 'SETTLED'
          when bool_or(bs.status in ('PARTIAL','SETTLED')) then 'PARTIAL'
          else 'PENDING'
        end as settlement_status
        from bridge_title_settlements bs
        where bs.title_id = t.id
          and (${isFinanceViewer} or (${canReadOwnFinance} and t.owner_user_id = ${actor.userId}))
      ) s on true
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', dp.id,
            'buyer', dp.destination,
            'state', dp.readiness_state,
            'territories', coalesce(rg.territories, '[]'::jsonb),
            'languages', coalesce(rg.languages, '[]'::jsonb),
            'media', coalesce(rg.media, '[]'::jsonb),
            'windowStart', rg.window_start,
            'windowEnd', rg.window_end,
            'commercialModel', dp.commercial_model,
            'distributorExclusivity', dp.distributor_exclusivity,
            'revenueSharePercent', dp.revenue_share_percent
          )
          order by dp.created_at desc
        ) as destinations
        from bridge_destination_packages dp
        left join bridge_rights_grants rg on rg.id = dp.rights_grant_id
        where dp.title_id = t.id

      ) d on true
      where (
        ${isInternal}
        or t.owner_user_id = ${actor.userId}

      )
      order by t.updated_at desc
      limit 200
    `;

  return {
    deliveries: rows.map((r) => ({
      titleId: r.title_id,
      titleName: r.title_name,
      language: r.language,
      year: r.year,
      creator: r.creator,
      destinations: Array.isArray(r.destinations) ? r.destinations : [],
      investorCount: Number(r.investor_count ?? 0),
      settlementStatus: r.settlement_status,
    })),
  };
}
