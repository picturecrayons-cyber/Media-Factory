import { createFileRoute } from "@tanstack/react-router";
import { assertSameSiteRequest, CrossSiteRequestError } from "@/lib/auth/isolation.server";
import { requireUser, UnauthorizedError } from "@/lib/auth/verify.server";
import { assertNotDevUser } from "@/lib/bridge/guards";
import { assertPermission } from "@/lib/bridge/rbac";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { fetchObjectResponse } from "@/lib/bridge/oci-object-storage.server";
import { getSql } from "@/lib/db";

const MAX_POSTER_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export const Route = createFileRoute("/api/buyer/poster")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          assertSameSiteRequest();

          const authorization = request.headers.get("authorization") ?? "";
          const bearerToken = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
          if (!bearerToken) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const user = await requireUser(bearerToken);
          assertNotDevUser(user.id);
          const actor = await requireVerifiedActor(user.id, user.aal);
          if (actor.accountType !== "buyer" || actor.internalRole) {
            return new Response(null, { status: 404 });
          }
          try {
            assertPermission(actor, "title.read_catalog");
          } catch {
            return new Response(null, { status: 403 });
          }

          const titleId = new URL(request.url).searchParams.get("titleId");
          if (!titleId || titleId.length > 128) {
            return Response.json({ error: "Invalid title" }, { status: 400 });
          }

          const sql = await getSql();
          const rows = await sql<{
            s3_key: string;
            content_type: string;
            byte_size: number | string;
          }>`
            select a.s3_key, a.content_type, a.byte_size
            from bridge_titles t
            join bridge_assets a
              on a.title_id = t.id
             and a.s3_key = t.poster_key
             and a.kind in ('poster', 'poster_vertical')
             and a.byte_size > 0
             and a.byte_size <= ${MAX_POSTER_BYTES}
             and a.content_type is not null
             -- These storage lifecycle columns are present in the deployed production
             -- schema but are not part of the original base migration. Inspect the
             -- row as JSON so the query also works on clean migration replays.
             and (
               not (to_jsonb(a) ? 'storage_business_state')
               or to_jsonb(a)->>'storage_business_state' = 'ACTIVE'
             )
             and (
               not (to_jsonb(a) ? 'restore_state')
               or to_jsonb(a)->>'restore_state' = 'READY'
             )
            where t.id = ${titleId}
              and to_jsonb(t)->>'merged_into_title_id' is null
              and t.status in ('LIVE_FOR_BUYERS', 'IN_NEGOTIATION', 'LICENSED', 'DELIVERED')
              and public.bridge_title_buyer_visibility(t.id)
              and exists (
                select 1
                from bridge_qc_cases q
                where q.title_id = t.id
                  and q.status = 'PASSED'
                  and q.reviewer_findings->0->>'masterKey' = t.master_key
                  and q.reviewer_findings->0->>'posterKey' = t.poster_key
              )
            limit 1
          `;

          const asset = rows[0];
          if (
            !asset ||
            !ALLOWED_IMAGE_TYPES.has(asset.content_type.toLowerCase()) ||
            Number(asset.byte_size) <= 0 ||
            Number(asset.byte_size) > MAX_POSTER_BYTES
          ) {
            return new Response(null, { status: 404 });
          }

          const upstream = await fetchObjectResponse(asset.s3_key);
          if (!upstream.ok || !upstream.body) {
            await upstream.body?.cancel();
            return new Response(null, { status: 502 });
          }

          const upstreamType = (upstream.headers.get("content-type") ?? "")
            .split(";")[0]
            .trim()
            .toLowerCase();
          const upstreamSize = Number(upstream.headers.get("content-length") ?? "");
          if (
            upstreamType !== asset.content_type.toLowerCase() ||
            !ALLOWED_IMAGE_TYPES.has(upstreamType) ||
            upstreamSize !== Number(asset.byte_size)
          ) {
            await upstream.body.cancel();
            return new Response(null, { status: 502 });
          }

          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Content-Type": upstreamType,
              "Content-Length": String(asset.byte_size),
              "Cache-Control": "private, max-age=60",
              "Vary": "Authorization",
              "Cross-Origin-Resource-Policy": "same-origin",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          if (error instanceof CrossSiteRequestError) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }
          console.error("[bridge] buyer poster proxy failed", {
            errorType: error instanceof Error ? error.name : "unknown",
          });
          return Response.json({ error: "Poster unavailable" }, { status: 502 });
        }
      },
    },
  },
});
