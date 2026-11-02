import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { hasPermission, assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";

/**
 * Discovery contracts intentionally expose a small, role-specific card DTO.
 * Do not replace these projections with mapTitle(): that model contains raw
 * storage keys and internal fields which are not appropriate for discovery.
 */
export type DiscoveryTitleCard = {
  id: string;
  slug: string;
  name: string;
  nameMl: string | null;
  synopsis: string;
  language: string;
  year: number | null;
  runtimeMinutes: number | null;
  contentType: string;
  countryOfOrigin: string | null;
  status: string;
  releaseDate: string | null;
  updatedAt: string;
};

type DiscoveryTitleRow = {
  id: string;
  slug: string;
  name: string;
  name_ml: string | null;
  synopsis: string | null;
  language: string | null;
  year: number | null;
  runtime_minutes: number | null;
  content_type: string | null;
  country_of_origin: string | null;
  status: string;
  release_date: string | Date | null;
  updated_at: string | Date;
};

function iso(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function mapDiscoveryTitleCard(row: DiscoveryTitleRow): DiscoveryTitleCard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameMl: row.name_ml,
    synopsis: row.synopsis ?? "",
    language: row.language ?? "",
    year: row.year,
    runtimeMinutes: row.runtime_minutes,
    contentType: row.content_type ?? "",
    countryOfOrigin: row.country_of_origin,
    status: row.status,
    releaseDate: iso(row.release_date),
    updatedAt: iso(row.updated_at) ?? "",
  };
}

async function hasMergeColumn(sql: Sql): Promise<boolean> {
  const rows = await sql<{ exists: boolean }>`
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bridge_titles'
        and column_name = 'merged_into_title_id'
    ) as exists
  `;
  return Boolean(rows[0]?.exists);
}

async function selectDiscoveryTitles(
  sql: Sql,
  where: "admin" | "buyer" | "investor",
  userId?: string,
): Promise<DiscoveryTitleRow[]> {
  const mergeColumn = await hasMergeColumn(sql);
  const mergePredicate = mergeColumn ? sql`and t.merged_into_title_id is null` : sql``;

  if (where === "admin") {
    return sql<DiscoveryTitleRow>`
      select t.id, t.slug, t.name, t.name_ml, t.synopsis, t.language,
             t.year, t.runtime_minutes, t.content_type, t.country_of_origin,
             t.status, t.release_date, t.updated_at
      from bridge_titles t
      where true ${mergePredicate}
      order by t.updated_at desc
      limit 200
    `;
  }

  if (where === "buyer") {
    return sql<DiscoveryTitleRow>`
      select t.id, t.slug, t.name, t.name_ml, t.synopsis, t.language,
             t.year, t.runtime_minutes, t.content_type, t.country_of_origin,
             t.status, t.release_date, t.updated_at
      from bridge_titles t
      where t.status in ('LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
        and public.bridge_title_buyer_visibility(t.id)
        ${mergePredicate}
      order by t.updated_at desc
      limit 200
    `;
  }

  return sql<DiscoveryTitleRow>`
    select t.id, t.slug, t.name, t.name_ml, t.synopsis, t.language,
           t.year, t.runtime_minutes, t.content_type, t.country_of_origin,
           t.status, t.release_date, t.updated_at
    from bridge_title_investors i
    join bridge_titles t on t.id = i.title_id
    where i.investor_user_id = ${userId!}
      ${mergePredicate}
    order by t.updated_at desc
    limit 200
  `;
}

/** Internal catalog discovery. Staff role permissions are resolved server-side. */
export const listAdminDiscoveryTitles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!actor.internalRole || !hasPermission(actor, "title.read_catalog")) {
      throw new Error("Forbidden");
    }
    const sql = await getSql();
    const rows = await selectDiscoveryTitles(sql, "admin");
    return { titles: rows.map(mapDiscoveryTitleCard) };
  });

/** Buyer marketplace discovery. Only the canonical buyer-publication gate can admit a title. */
export const listBuyerDiscoveryTitles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "buyer") throw new Error("Forbidden");
    assertPermission(actor, "title.read_catalog");
    const sql = await getSql();
    const rows = await selectDiscoveryTitles(sql, "buyer");
    return { titles: rows.map(mapDiscoveryTitleCard) };
  });

/** Investor discovery is assignment-scoped; no general catalog fallback exists. */
export const listInvestorDiscoveryTitles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || actor.accountType !== "investor") throw new Error("Forbidden");
    const sql = await getSql();
    const rows = await selectDiscoveryTitles(sql, "investor", actor.userId);
    return { titles: rows.map(mapDiscoveryTitleCard) };
  });
