import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";

type LoopTitleAnalyticsRow = {
  bridge_title_id: string;
  title_name: string;
  lifecycle_status: string;
  publication_status: string | null;
  loop_title_status: string | null;
  listed: boolean | null;
  published: boolean | null;
  unique_viewers: number | string;
  completed_viewers: number | string;
  watch_seconds: number | string;
  average_completion_pct: number | string | null;
  active_rentals: number | string;
  active_purchases: number | string;
  fulfilled_payment_events: number | string;
  refunded_payment_events: number | string;
};

export const getLoopTitleAnalytics = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const isSuperAdmin = actor.internalRole === "super_admin";
    if (!isSuperAdmin && !["creator", "independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Title-owner or Super Admin access required");
    }

    const sql = await getSql();
    const rows = await sql<LoopTitleAnalyticsRow>`
      with owned_titles as (
        select t.id, t.name, t.status
        from bridge_titles t
        where
          ${isSuperAdmin}
          or t.owner_user_id = ${actor.userId}
          or (
            t.owner_account_type = 'studio'
            and t.owner_organization_id = ${actor.organizationId ?? null}
            and ${Boolean(actor.organizationId)}
            and exists (
              select 1 from bridge_organization_memberships m
              where m.organization_id = t.owner_organization_id
                and m.user_id = ${actor.userId}
                and m.status = 'active'
            )
          )
      ),
      watch as (
        select title_id,
          count(distinct user_id)::int as unique_viewers,
          count(*) filter (where completed = true)::int as completed_viewers,
          coalesce(sum(position_seconds), 0)::numeric as watch_seconds,
          avg(case when duration_seconds > 0
            then least(100, greatest(0, position_seconds / duration_seconds * 100))
            else null end)::numeric as average_completion_pct
        from loop_watch_progress
        group by title_id
      ),
      entitlements as (
        select title_id,
          count(*) filter (where access_type = 'RENTAL' and status = 'ACTIVE')::int as active_rentals,
          count(*) filter (where access_type = 'PURCHASE' and status = 'ACTIVE')::int as active_purchases
        from loop_user_tvod_entitlements
        group by title_id
      ),
      payment_events as (
        select payload->>'title_id' as loop_title_id,
          count(*) filter (where status = 'processed')::int as fulfilled_payment_events,
          count(*) filter (where status = 'refunded')::int as refunded_payment_events
        from loop_payment_events
        where event_name = 'tvod_fulfilled'
          and status in ('processed','refunded')
        group by payload->>'title_id'
      )
      select
        t.id as bridge_title_id,
        t.name as title_name,
        t.status as lifecycle_status,
        p.authorization_status as publication_status,
        lt.status as loop_title_status,
        lt.listed,
        lt.published,
        coalesce(w.unique_viewers, 0)::int as unique_viewers,
        coalesce(w.completed_viewers, 0)::int as completed_viewers,
        coalesce(w.watch_seconds, 0)::numeric as watch_seconds,
        w.average_completion_pct,
        coalesce(e.active_rentals, 0)::int as active_rentals,
        coalesce(e.active_purchases, 0)::int as active_purchases,
        coalesce(pe.fulfilled_payment_events, 0)::int as fulfilled_payment_events,
        coalesce(pe.refunded_payment_events, 0)::int as refunded_payment_events
      from owned_titles t
      left join bridge_loop_publications p on p.bridge_title_id = t.id
      left join loop_titles lt on lt.id = p.loop_title_id
      left join watch w on w.title_id = lt.id
      left join entitlements e on e.title_id = lt.id
      left join payment_events pe on pe.loop_title_id = lt.id::text
      order by t.name
      limit 500
    `;

    return JSON.parse(JSON.stringify({
      scope: isSuperAdmin ? "ALL_TITLES" : "OWNED_TITLES",
      generatedAt: new Date().toISOString(),
      rows,
      financialAmounts: "NOT_RECONCILED",
      note: "Playback progress is a per-viewer latest-progress snapshot, not a count of play starts. Payment event counts are not settlement or payable totals.",
    }, (_, value) => typeof value === "bigint" ? value.toString() : value));
  });
