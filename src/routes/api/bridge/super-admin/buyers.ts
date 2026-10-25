import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/lib/auth/verify.server";
import { loadActor } from "@/lib/bridge/session";
import { canAccessDashboard } from "@/lib/bridge/rbac";
import { getSql } from "@/lib/db";

function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : undefined;
}

export const Route = createFileRoute("/api/bridge/super-admin/buyers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(bearer(request));
          const actor = await loadActor(user.id);
          if (!actor || !actor.emailVerified || !canAccessDashboard(actor)) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }
          const sql = await getSql();
          const rows = await sql<{
            id: number; display_name: string | null; user_type: string;
            last_login: string | null; active_mappings: number;
          }>`
            select u.id, coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Buyer ' || u.id::text) as display_name,
              u.user_type, u.last_login,
              count(m.film_id) filter (where m.is_active = true)::int as active_mappings
            from accounts_user u
            left join films_filmbuyermapping m on m.buyer_id = u.id
            where u.user_type = 'buyer_partner'
            group by u.id, u.first_name, u.last_name, u.user_type, u.last_login
            order by display_name
            limit 500
          `;
          return Response.json({ buyers: rows });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (/authentication|session|required/i.test(message)) return Response.json({ error: "Unauthorized" }, { status: 401 });
          console.error("[super-admin-buyers] query failed", error);
          return Response.json({ error: "Buyer desk unavailable" }, { status: 503 });
        }
      },
    },
  },
});
