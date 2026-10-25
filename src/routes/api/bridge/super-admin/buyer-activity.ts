import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/lib/auth/verify.server";
import { loadActor } from "@/lib/bridge/session";
import { canAccessDashboard } from "@/lib/bridge/rbac";
import { getSql } from "@/lib/db";

const JANANAM_TITLE_ID = "title-jananam-1947";

function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : undefined;
}

export const Route = createFileRoute("/api/bridge/super-admin/buyer-activity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(bearer(request));
          const actor = await loadActor(user.id);
          if (!actor || !actor.emailVerified || !canAccessDashboard(actor)) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }

          const url = new URL(request.url);
          const legacyFilmId = url.searchParams.get("film_id");
          const titleId = url.searchParams.get("title_id") ??
            (!legacyFilmId || legacyFilmId === "7" ? JANANAM_TITLE_ID : "");
          if (!titleId || titleId.length > 160 || !/^[a-zA-Z0-9_-]+$/.test(titleId)) {
            return Response.json({ error: "Invalid title_id" }, { status: 400 });
          }

          const sql = await getSql();
          const rows = await sql.query<{
            buyer_id: string;
            buyer_name: string;
            title_id: string;
            title_name: string;
            has_mapping: boolean;
            access_active: boolean;
            access_granted_at: string | null;
            deal_status: string | null;
            licensed_at: string | null;
            rights_category: string | null;
            territories: string | null;
            languages: string | null;
            media_modes: string | null;
            rights_notes: string | null;
            payment_status: string | null;
            payment_amount_paise: string | null;
            payment_currency: string | null;
            watch_count: number;
            last_watched_at: string | null;
          }>(
            [
              "with title_buyers as (",
              "  select buyer_user_id as user_id from public.bridge_buyer_title_access where title_id = $1",
              "  union select buyer_user_id from public.bridge_license_deals where title_id = $1",
              "  union select user_id from public.bridge_payments where title_id = $1",
              "  union select user_id from public.bridge_entitlements where title_id = $1",
              "  union select buyer_user_id from public.bridge_deal_entitlements where title_id = $1",
              "  union select buyer_user_id from public.bridge_package_entitlements where title_id = $1",
              "  union select user_id from public.bridge_loop_analytics_events where bridge_title_id = $1",
              ")",
              "select bp.user_id as buyer_id, bp.display_name as buyer_name,",
              "  t.id as title_id, t.name as title_name,",
              "  true as has_mapping,",
              "  coalesce(access.access_active, false) as access_active,",
              "  access.granted_at as access_granted_at,",
              "  deal.status as deal_status, deal.licensed_at,",
              "  deal.rights_category, deal.territories::text as territories,",
              "  deal.languages::text as languages, deal.media_modes::text as media_modes,",
              "  coalesce(nullif(deal.terms_snapshot ->> 'rights_notes', ''),",
              "    nullif(deal.terms_snapshot ->> 'notes', ''),",
              "    nullif(deal.terms_snapshot ->> 'rights_scope', '')) as rights_notes,",
              "  payment.status as payment_status, payment.amount_paise::text as payment_amount_paise,",
              "  payment.currency as payment_currency,",
              "  coalesce(watch.watch_count, 0)::int as watch_count, watch.last_watched_at",
              "from title_buyers tb",
              "join public.bridge_profiles bp on bp.user_id = tb.user_id and bp.account_type = 'buyer'",
              "join public.bridge_titles t on t.id = $1",
              "left join lateral (",
              "  select true as access_active, granted_at",
              "  from public.bridge_buyer_title_access a",
              "  where a.title_id = t.id and a.buyer_user_id = bp.user_id",
              "    and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())",
              "  order by a.granted_at desc limit 1",
              ") access on true",
              "left join lateral (",
              "  select status, licensed_at, rights_category, territories, languages, media_modes, terms_snapshot",
              "  from public.bridge_license_deals d",
              "  where d.title_id = t.id and d.buyer_user_id = bp.user_id",
              "  order by d.created_at desc limit 1",
              ") deal on true",
              "left join lateral (",
              "  select status, amount_paise, currency",
              "  from public.bridge_payments p",
              "  where p.title_id = t.id and p.user_id = bp.user_id",
              "  order by case when p.status = 'success' then 0 when p.status = 'pending' then 1 else 2 end, p.created_at desc",
              "  limit 1",
              ") payment on true",
              "left join lateral (",
              "  select count(*) filter (where e.watched_seconds > 0)::int as watch_count,",
              "    max(e.received_at) filter (where e.watched_seconds > 0) as last_watched_at",
              "  from public.bridge_loop_analytics_events e",
              "  where e.bridge_title_id = t.id and e.user_id = bp.user_id",
              ") watch on true",
              "order by bp.display_name",
              "limit 500",
            ].join("\n"),
            [titleId],
          );

          const activity = rows.map((row) => ({
            ...row,
            workflow: [
              "MAPPED",
              row.access_active ? "ALLOWED" : null,
              row.licensed_at ? "LICENSED" : null,
              row.payment_status === "success" ? "PAID" : null,
            ].filter((stage): stage is string => Boolean(stage)),
            request_tracking: "Not represented in the current Bridge schema",
            download_permission: "Not represented in the current Bridge schema",
          }));

          return Response.json({
            title_id: titleId,
            legacy_film_id: titleId === JANANAM_TITLE_ID ? 7 : null,
            activity,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (/authentication|session|required/i.test(message)) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          console.error("[super-admin-buyer-activity] query failed", error);
          return Response.json({ error: "Buyer activity unavailable" }, { status: 503 });
        }
      },
    },
  },
});
