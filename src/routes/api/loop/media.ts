import { createHmac, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { bridgeEnv } from "@/lib/bridge/env";
import { fetchObjectResponse } from "@/lib/bridge/oci-object-storage.server";
import { getSql } from "@/lib/db";

const MAX_BODY_BYTES = 4096;
const MAX_CLOCK_SKEW_SECONDS = 60;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "application/octet-stream"]);

function validSignature(secret: string, timestamp: string, raw: string, supplied: string) {
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const seconds = Math.floor(Date.now() / 1000);
  if (Math.abs(seconds - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + raw).digest();
  const actual = Buffer.from(supplied, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const Route = createFileRoute("/api/loop/media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = bridgeEnv.loopMediaSharedSecret();
        if (!secret) return Response.json({ error: "Loop media delivery is not configured" }, { status: 503 });
        const timestamp = request.headers.get("x-bridge-timestamp") ?? "";
        const signature = request.headers.get("x-bridge-signature") ?? "";
        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Payload too large" }, { status: 413 });
        if (!validSignature(secret, timestamp, raw, signature)) {
          return Response.json({ error: "Unauthorized media service request" }, { status: 401 });
        }

        let body: { loopTitleId?: unknown; bridgeTitleId?: unknown; role?: unknown; userId?: unknown };
        try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
        const loopTitleId = typeof body.loopTitleId === "string" ? body.loopTitleId : "";
        const bridgeTitleId = typeof body.bridgeTitleId === "string" ? body.bridgeTitleId : "";
        const role = body.role;
        const userId = typeof body.userId === "string" ? body.userId : null;
        if (!loopTitleId || loopTitleId.length > 128 || !bridgeTitleId || bridgeTitleId.length > 128 ||
            (role !== "MASTER" && role !== "POSTER" && role !== "TRAILER")) {
          return Response.json({ error: "Invalid media request" }, { status: 400 });
        }
        if (role === "TRAILER") return new Response(null, { status: 404 });

        try {
          const sql = await getSql();
          const catalog = await sql<{
            id: string; bridge_title_id: string; status: string; listed: boolean;
            published: boolean; access_tier: string; poster_available: boolean;
          }>`select id::text as id, bridge_title_id::text as bridge_title_id, status, listed, published,
                    access_tier, poster_available
             from public_loop_catalog()
             where id::text = ${loopTitleId} and bridge_title_id::text = ${bridgeTitleId}
             limit 1`;
          const title = catalog[0];
          if (!title || !["APPROVED", "PUBLISHED"].includes(String(title.status).toUpperCase()) ||
              title.listed !== true || title.published !== true) {
            return new Response(null, { status: 404 });
          }
          if (role === "MASTER") {
            if (!userId || String(title.access_tier).toUpperCase() !== "TVOD") {
              return Response.json({ error: "A valid TVOD identity is required" }, { status: 403 });
            }
            const authorized = await sql<{ ok: boolean }>`select
              exists(select 1 from bridge_loop_identity_links i
                     where i.auth_user_id::text = ${userId} and i.bridge_user_id is not null)
              and exists(select 1 from loop_user_tvod_entitlements e
                         where e.user_id::text = ${userId}
                           and e.title_id::text = ${loopTitleId}
                           and e.status = 'ACTIVE'
                           and e.access_type = 'RENTAL'
                           and e.expires_at > now()) as ok`;
            if (!authorized[0]?.ok) return Response.json({ error: "Active Bridge-linked rental required" }, { status: 403 });
          } else if (title.poster_available !== true) {
            return new Response(null, { status: 404 });
          }

          const assets = await sql<{
            s3_key: string; content_type: string; byte_size: number | string; sha256: string;
          }>`select a.s3_key, a.content_type, a.byte_size,
                    coalesce(to_jsonb(a)->>'sha256', to_jsonb(a)->>'checksum_sha256') as sha256
             from bridge_titles t
             join bridge_assets a on a.title_id = t.id
             where t.id::text = ${bridgeTitleId}
               and a.s3_key = case when ${role} = 'MASTER' then t.master_key else t.poster_key end
               and a.kind = case when ${role} = 'MASTER' then 'master' else 'poster' end
               and a.byte_size > 0
               and (not (to_jsonb(a) ? 'storage_business_state') or to_jsonb(a)->>'storage_business_state' = 'ACTIVE')
               and (not (to_jsonb(a) ? 'restore_state') or to_jsonb(a)->>'restore_state' = 'READY')
               and coalesce(to_jsonb(a)->>'sha256', to_jsonb(a)->>'checksum_sha256') ~ '^[a-f0-9]{64}$'
               and exists (
                 select 1 from bridge_qc_cases q
                 where q.title_id = t.id and q.status = 'PASSED'
                   and q.reviewer_findings->0->>'masterKey' = t.master_key
                   and q.reviewer_findings->0->>'posterKey' = t.poster_key
               )
             limit 1`;
          const asset = assets[0];
          const allowedTypes = role === "POSTER" ? IMAGE_TYPES : VIDEO_TYPES;
          if (!asset || !allowedTypes.has(String(asset.content_type).toLowerCase())) {
            return Response.json({ error: "Current verified Bridge asset unavailable" }, { status: 503 });
          }

          const upstream = await fetchObjectResponse(asset.s3_key, undefined, request.headers.get("range"));
          if (!upstream.ok || !upstream.body) {
            await upstream.body?.cancel();
            return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
          }
          const upstreamType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
          const upstreamLength = upstream.headers.get("content-length");
          if (upstreamType !== asset.content_type.toLowerCase() ||
              (upstream.status === 200 && Number(upstreamLength) !== Number(asset.byte_size))) {
            await upstream.body.cancel();
            return new Response(null, { status: 502 });
          }
          const headers = new Headers({
            "Content-Type": upstreamType,
            "Cache-Control": role === "MASTER" ? "private, no-store" : "public, max-age=60",
            "Accept-Ranges": "bytes",
            "X-Content-Type-Options": "nosniff",
          });
          if (upstreamLength) headers.set("Content-Length", upstreamLength);
          const contentRange = upstream.headers.get("content-range");
          if (contentRange) headers.set("Content-Range", contentRange);
          return new Response(upstream.body, { status: upstream.status, headers });
        } catch (error) {
          console.error("[bridge] Loop OCI media delivery failed", {
            errorType: error instanceof Error ? error.name : "unknown",
          });
          return Response.json({ error: "Media delivery unavailable" }, { status: 502 });
        }
      },
    },
  },
});
