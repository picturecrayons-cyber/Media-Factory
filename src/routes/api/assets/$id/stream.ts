import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { verifyAssetStreamToken } from "@/lib/bridge/asset-stream-token.server";
import { getObjectResponse, isValidObjectByteRange } from "@/lib/bridge/oci-object-storage.server";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { loadTitle } from "@/lib/bridge/titles";
import { canReadTitle } from "@/lib/bridge/rbac";
import { downloadDecision } from "@/lib/bridge/delivery-policy";
import { assertBuyerPublishable } from "@/lib/bridge/buyer-visibility";

export const Route = createFileRoute("/api/assets/$id/stream")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        let claims: ReturnType<typeof verifyAssetStreamToken>;
        try {
          claims = verifyAssetStreamToken(new URL(request.url).searchParams.get("token") ?? "", params.id);
        } catch {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Re-resolve the signed actor from current server-side profile state on every
        // request. HMAC integrity alone is not an authorization decision.
        let actor;
        try {
          actor = await requireVerifiedActor(claims.actorUserId);
        } catch {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const sql = await getSql();
        const rows = await sql<{
          id: string;
          title_id: string;
          kind: string;
          verified_object_key: string;
          content_type: string | null;
          byte_size: number;
          checksum_sha256: string;
        }>`
          select a.id, a.title_id, a.kind, a.verified_object_key,
            a.content_type, a.byte_size, a.checksum_sha256
          from bridge_assets a
          where a.id=${params.id} and a.byte_size>0
            and a.verified_object_key is not null
            and a.checksum_sha256 ~ '^[a-f0-9]{64}$'
          limit 1
        `;
        const asset = rows[0];
        if (!asset) return Response.json({ error: "Asset unavailable" }, { status: 404 });

        const title = await loadTitle(asset.title_id);
        if (!title || !canReadTitle(actor, title)) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        if (actor.accountType === "buyer" && !actor.internalRole) {
          try {
            await assertBuyerPublishable(title.id);
          } catch {
            return Response.json({ error: "Title is not currently published" }, { status: 403 });
          }
          const entitlement = await sql<{ allowed: boolean }>`
            select exists (
              select 1 from bridge_entitlements
              where user_id=${actor.userId}
                and title_id=${title.id}
                and access_type='license'
            ) as allowed
          `;
          const decision = downloadDecision({
            kind: asset.kind,
            actorIsOwner: false,
            actorIsInternal: false,
            accountType: actor.accountType,
            hasLicenseEntitlement: Boolean(entitlement[0]?.allowed),
          });
          if (!entitlement[0]?.allowed || !decision.allow) {
            return Response.json({ error: "Active title license required" }, { status: 403 });
          }
        } else {
          const decision = downloadDecision({
            kind: asset.kind,
            actorIsOwner: title.ownerUserId === actor.userId,
            actorIsInternal: Boolean(actor.internalRole),
            accountType: actor.accountType,
            hasLicenseEntitlement: false,
          });
          if (!decision.allow) return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const range = request.headers.get("range") ?? undefined;
        if (range && !isValidObjectByteRange(range)) {
          return new Response(null, {
            status: 416,
            headers: {
              "content-range": `bytes */${asset.byte_size}`,
              "accept-ranges": "bytes",
              "cache-control": "private, no-store",
            },
          });
        }

        let upstream: Response;
        try {
          upstream = await getObjectResponse(asset.verified_object_key, range);
        } catch {
          return Response.json({ error: "Asset stream unavailable" }, { status: 502 });
        }
        if (upstream.status === 416) {
          const headers = new Headers({
            "accept-ranges": "bytes",
            "cache-control": "private, no-store",
            "content-range": upstream.headers.get("content-range") || `bytes */${asset.byte_size}`,
          });
          return new Response(null, { status: 416, headers });
        }
        if ((!upstream.ok && upstream.status !== 206) || !upstream.body) {
          return Response.json({ error: "Asset stream unavailable" }, {
            status: upstream.status === 404 ? 404 : 502,
          });
        }
        if (range && upstream.status !== 206) {
          await upstream.body.cancel();
          return Response.json({ error: "Storage provider did not honor byte range" }, { status: 502 });
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
