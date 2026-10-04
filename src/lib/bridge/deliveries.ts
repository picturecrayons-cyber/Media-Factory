import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";

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
    territories: unknown;
    languages: unknown;
    media: unknown;
    windowStart: string | null;
    windowEnd: string | null;
  }>;
  investorCount: number;
  settlementStatus: string;
};

export const listDeliveryTraces = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole) assertPermission(actor, "title.read_catalog");
    else assertPermission(actor, actor.accountType === "buyer" ? "title.read_catalog" : "title.read_own");

    const sql = await getSql();
    const rows = await sql<any>`
      select
        t.id as title_id,
        t.name as title_name,
        t.language,
        t.year,
        coalesce(nullif(p.organization_name, ''), nullif(p.display_name, ''), t.owner_user_id) as creator,
        coalesce(i.investor_count, 0) as investor_count,
        coalesce(s.settlement_status, 'PENDING') as settlement_status,
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
          when bool_and(bs.status = 'SETTLED') then 'SETTLED'
          when bool_or(bs.status in ('PARTIAL','SETTLED')) then 'PARTIAL'
          else 'PENDING'
        end as settlement_status
        from bridge_title_settlements bs
        where bs.title_id = t.id
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
            'windowEnd', rg.window_end
          )
          order by dp.created_at desc
        ) as destinations
        from bridge_destination_packages dp
        left join bridge_rights_grants rg on rg.id = dp.rights_grant_id
        where dp.title_id = t.id
      ) d on true
      where (
        ${Boolean(actor.internalRole)}
        or t.owner_user_id = ${actor.userId}
        or (
          ${actor.accountType === "buyer"}
          and t.status in ('LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
        )
      )
      order by t.updated_at desc
      limit 200
    `;

    return {
      deliveries: rows.map((r: any) => ({
        titleId: r.title_id,
        titleName: r.title_name,
        language: r.language,
        year: r.year,
        creator: r.creator,
        destinations: Array.isArray(r.destinations) ? r.destinations : [],
        investorCount: Number(r.investor_count ?? 0),
        settlementStatus: r.settlement_status ?? "PENDING",
      })) as DeliveryTrace[],
    };
  });
