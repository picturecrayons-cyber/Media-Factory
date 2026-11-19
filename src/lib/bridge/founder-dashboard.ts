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
