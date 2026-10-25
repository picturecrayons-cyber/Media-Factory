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
          const buyers = await sql.query<{
            id: string;
            display_name: string;
            account_type: string;
            last_login: string | null;
            active_mappings: number;
          }>(
            [
              "select bp.user_id as id, bp.display_name, bp.account_type,",
              "  null::text as last_login,",
              "  count(distinct access.title_id) filter (",
              "    where access.revoked_at is null",
              "      and (access.expires_at is null or access.expires_at > now())",
              "  )::int as active_mappings",
              "from public.bridge_profiles bp",
              "left join public.bridge_buyer_title_access access",
              "  on access.buyer_user_id = bp.user_id",
              "where bp.account_type = 'buyer'",
              "group by bp.user_id, bp.display_name, bp.account_type",
              "order by bp.display_name",
              "limit 500",
            ].join("\\n"),
          );

          return Response.json({ buyers });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (/authentication|session|required/i.test(message)) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          console.error("[super-admin-buyers] query failed", error);
          return Response.json({ error: "Buyer desk unavailable" }, { status: 503 });
        }
      },
    },
  },
});
