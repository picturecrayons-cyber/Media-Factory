import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";

/**
 * Read-only storage metadata overview for Super Admin.
 * Never returns object keys, signed URLs, credentials or asset contents.
 * No storage provider is contacted and no object is modified.
 */
export const listSuperAdminStorageOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Super Admin access required");
    }

    const sql = await getSql();
    const [groups, recent] = await Promise.all([
      sql<{
        kind: string;
        asset_count: number | string;
        verified_count: number | string;
        total_bytes: number | string;
      }>`
        select kind, count(*)::int as asset_count,
               count(*) filter (where byte_size is not null)::int as verified_count,
               coalesce(sum(byte_size), 0)::bigint as total_bytes
        from bridge_assets
        group by kind
        order by kind
      `,
      sql<{
        id: string;
        title_name: string | null;
        kind: string;
        content_type: string | null;
        byte_size: number | string | null;
        created_at: string | Date;
      }>`
        select a.id, t.name as title_name, a.kind, a.content_type,
               a.byte_size, a.created_at
        from bridge_assets a
        left join bridge_titles t on t.id = a.title_id
        order by a.created_at desc
        limit 25
      `,
    ]);

    return {
      summary: groups.map((row) => ({
        kind: row.kind,
        assetCount: Number(row.asset_count),
        verifiedCount: Number(row.verified_count),
        totalBytes: Number(row.total_bytes),
      })),
      recentAssets: recent.map((row) => ({
        reference: row.id,
        titleName: row.title_name,
        kind: row.kind,
        contentType: row.content_type,
        byteSize: row.byte_size == null ? null : Number(row.byte_size),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        verified: row.byte_size != null,
      })),
    };
  });
