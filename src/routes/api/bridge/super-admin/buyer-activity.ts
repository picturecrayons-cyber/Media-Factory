import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/lib/auth/verify.server";
import { loadActor } from "@/lib/bridge/session";
import { canAccessDashboard } from "@/lib/bridge/rbac";
import { getSql } from "@/lib/db";

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
          const rawFilmId = url.searchParams.get("film_id");
          const filmId = rawFilmId ? Number(rawFilmId) : 7;
          if (!Number.isSafeInteger(filmId) || filmId < 1) {
            return Response.json({ error: "Invalid film_id" }, { status: 400 });
          }
          const sql = await getSql();
          const rows = await sql<{
            buyer_id: number; film_id: number; is_active: boolean;
            allow_download: boolean; download_requested: boolean;
            film_info_requested: boolean; trailer_download_requested: boolean;
            notes: string | null; payment_status: string | null;
            payment_amount: string | null; currency: string | null;
            watch_count: number; last_watched_at: string | null;
          }>`
            select m.buyer_id, m.film_id, m.is_active, m.allow_download,
              m.download_requested, m.film_info_requested, m.trailer_download_requested, m.notes,
              p.status as payment_status, p.amount::text as payment_amount, p.currency,
              coalesce(v.watch_count, 0)::int as watch_count, v.last_watched_at
            from films_filmbuyermapping m
            left join lateral (
              select status, amount, currency
              from films_payment
              where user_id = m.buyer_id and status in ('success', 'pending')
              order by case when status = 'success' then 0 else 1 end
              limit 1
            ) p on true
            left join lateral (
              select count(*)::int as watch_count, max(watched_at) as last_watched_at
              from films_viewhistory
              where user_id = m.buyer_id and film_id = m.film_id
            ) v on true
            where m.film_id = ${filmId}
            order by m.buyer_id
            limit 500
          `;
          const activity = rows.map((row) => ({
            ...row,
            workflow: [
              "MAPPED",
              row.download_requested || row.film_info_requested || row.trailer_download_requested ? "REQUESTED" : null,
              row.allow_download ? "ALLOWED" : null,
              row.is_active ? "LICENSED" : null,
              row.payment_status === "success" ? "PAID" : null,
            ].filter(Boolean),
          }));
          return Response.json({ film_id: filmId, activity });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (/authentication|session|required/i.test(message)) return Response.json({ error: "Unauthorized" }, { status: 401 });
          console.error("[super-admin-buyer-activity] query failed", error);
          return Response.json({ error: "Buyer activity unavailable" }, { status: 503 });
        }
      },
    },
  },
});
