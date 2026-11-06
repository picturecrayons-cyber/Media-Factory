import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { verifyAssetStreamToken } from "@/lib/bridge/asset-stream-token.server";
import { getObjectResponse } from "@/lib/bridge/oci-object-storage.server";

export const Route = createFileRoute("/api/assets/$id/stream")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        try {
          verifyAssetStreamToken(token, params.id);
        } catch {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const sql = await getSql();
        const rows = await sql<{
          verified_object_key: string; content_type: string | null; byte_size: number;
        }>`
          select a.verified_object_key, a.content_type, a.byte_size
          from bridge_assets a
          join bridge_titles t on t.id=a.title_id
          where a.id=${params.id} and a.byte_size>0
            and a.verified_object_key is not null
            and a.checksum_sha256 ~ '^[a-f0-9]{64}$'
          limit 1
        `;
        const asset = rows[0];
        if (!asset) return Response.json({ error: "Asset unavailable" }, { status: 404 });
        const range = request.headers.get("range") ?? undefined;
        const upstream = await getObjectResponse(asset.verified_object_key, range);
        if (!upstream.ok || !upstream.body) {
          return Response.json({ error: "Asset stream unavailable" }, { status: upstream.status === 404 ? 404 : 502 });
        }
        const headers = new Headers({
          "content-type": upstream.headers.get("content-type") || asset.content_type || "application/octet-stream",
          "content-length": upstream.headers.get("content-length") || String(asset.byte_size),
          "accept-ranges": "bytes",
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
          "content-disposition": "inline",
        });
        const contentRange = upstream.headers.get("content-range");
        if (contentRange) headers.set("content-range", contentRange);
        return new Response(upstream.body, { status: upstream.status, headers });
      },
    },
  },
});
