import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { assertNotDevUser } from "@/lib/bridge/guards";
import { getSql } from "@/lib/db";
import { signDownload } from "@/lib/bridge/oci-object-storage.server";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/bridge/assets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
          const user = await getSessionUser(token);
          if (!user) return jsonError("Authentication required", 401);
          assertNotDevUser(user.id);
          const actor = await requireVerifiedActor(user.id);
          if (actor.internalRole !== "super_admin" || !actor.emailVerified || !user.email_confirmed_at) {
            return jsonError("Super-admin access required", 403);
          }

          const url = new URL(request.url);
          const titleId = url.searchParams.get("title_id");
          const sql = await getSql();
          const rows = await sql<{
            id: string;
            title_id: string;
            title_name: string;
            kind: string;
            byte_size: number | null;
            content_type: string | null;
            s3_key: string | null;
            created_at: string | Date;
          }>`
            select a.id, a.title_id, t.name as title_name, a.kind, a.byte_size,
                   a.content_type, a.s3_key, a.created_at
            from bridge_assets a
            join bridge_titles t on t.id = a.title_id
            where (${titleId}::text is null or a.title_id = ${titleId})
            order by a.created_at desc
            limit 100
          `;

          const assets = await Promise.all(rows.map(async (asset) => {
            const verified = Number(asset.byte_size ?? 0) > 0;
            let preview_url: string | null = null;
            if (verified && asset.s3_key && ["poster", "poster_vertical", "poster_horizontal", "thumbnail"].includes(asset.kind)) {
              try {
                preview_url = (await signDownload({ key: asset.s3_key, expiresIn: 300 })).url;
              } catch {
                // Do not fail the entire gallery if a preview URL cannot be issued.
              }
            }
            return {
              id: asset.id,
              title_id: asset.title_id,
              title_name: asset.title_name,
              kind: asset.kind,
              storage_business_state: verified ? "VERIFIED" : "UNVERIFIED",
              s3_key: asset.s3_key,
              preview_url,
              created_at: asset.created_at instanceof Date ? asset.created_at.toISOString() : String(asset.created_at),
            };
          }));
          return Response.json({ assets }, { headers: { "Cache-Control": "no-store" } });
        } catch {
          return jsonError("Could not load verified asset gallery", 500);
        }
      },
    },
  },
});
