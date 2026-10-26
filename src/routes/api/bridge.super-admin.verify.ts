import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { assertNotDevUser } from "@/lib/bridge/guards";
import { getSql } from "@/lib/db";
import { loadTitle } from "@/lib/bridge/titles";
import { persistVerifiedAsset } from "@/lib/bridge/asset-confirmation";
import { verifyObject, sealVerifiedObject } from "@/lib/bridge/oci-object-storage.server";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/bridge/super-admin/verify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
        const user = await getSessionUser(token);
        if (!user) return errorResponse("Authentication required", 401);
        assertNotDevUser(user.id);
        const actor = await requireVerifiedActor(user.id);
        if (actor.internalRole !== "super_admin" || actor.emailVerified !== true || !user.email_confirmed_at) {
          return errorResponse("Verified super-admin access required", 403);
        }
        return errorResponse("Method not allowed", 405);
      },
      POST: async ({ request }) => {
        try {
          const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
          const user = await getSessionUser(token);
          if (!user) return errorResponse("Authentication required", 401);
          assertNotDevUser(user.id);
          const actor = await requireVerifiedActor(user.id);
          if (actor.internalRole !== "super_admin" || actor.emailVerified !== true || !user.email_confirmed_at) {
            return errorResponse("Verified super-admin access required", 403);
          }
          const input = await request.json() as { s3_key?: unknown; byte_size?: unknown };
          if (typeof input.s3_key !== "string" || input.s3_key.length < 8 ||
              typeof input.byte_size !== "number" || !Number.isSafeInteger(input.byte_size) || input.byte_size <= 0) {
            return errorResponse("s3_key and positive integer byte_size are required", 400);
          }
          const sql = await getSql();
          const rows = await sql<{
            id: string; title_id: string; kind: string; s3_key: string;
            created_by: string; content_type: string | null; byte_size: number | null;
          }>`
            select id, title_id, kind, s3_key, created_by, content_type, byte_size
            from bridge_assets
            where s3_key = ${input.s3_key} and created_by = ${actor.userId}
            order by created_at desc limit 1
          `;
          const asset = rows[0];
          if (!asset) return errorResponse("Upload reservation not found for this actor", 404);
          if (asset.byte_size != null) {
            return Response.json({ assetId: asset.id, verified: true, storage_state: "VERIFIED", byte_size: Number(asset.byte_size) }, {
              headers: { "Cache-Control": "no-store" },
            });
          }
          const title = await loadTitle(asset.title_id);
          if (!title || !["DRAFT", "UPLOADING", "PREPARING"].includes(title.status)) {
            return errorResponse("Title is not open for upload verification", 409);
          }
          const object = await verifyObject(asset.s3_key, asset.content_type);
          if (object.byteSize !== input.byte_size) return errorResponse("OCI object size does not match the uploaded file", 422);
          if (!object.etag) return errorResponse("OCI object ETag/checksum evidence is missing", 422);

          const sealedKey = `${asset.s3_key}.verified/${asset.id}`;
          const sealed = await sealVerifiedObject(asset.s3_key, sealedKey, object.etag);
          if (sealed.byteSize !== object.byteSize || !sealed.etag) {
            return errorResponse("Sealed OCI object failed size/checksum verification", 502);
          }
          const persisted = await persistVerifiedAsset(sql, {
            assetId: asset.id,
            actorUserId: actor.userId,
            internalActor: true,
            titleId: title.id,
            kind: asset.kind,
            byteSize: sealed.byteSize,
            contentType: sealed.contentType ?? asset.content_type,
            checksum: sealed.etag,
            sourceKey: asset.s3_key,
            sealedKey,
          });
          if (!persisted) {
            const current = await sql<{ byte_size: number | null; s3_key: string | null }>`
              select byte_size, s3_key from bridge_assets where id = ${asset.id} limit 1
            `;
            if (!current[0]?.byte_size || !current[0]?.s3_key?.includes(".verified/")) {
              return errorResponse("Verified object could not be persisted; asset remains unverified", 409);
            }
          }
          return Response.json({
            assetId: asset.id,
            verified: true,
            storage_state: "VERIFIED",
            byte_size: sealed.byteSize,
            checksum: sealed.etag,
          }, { status: 200, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (/super-admin|forbidden|access required|not authorized|profile|dev user|development user/i.test(message)) return errorResponse("Verified super-admin access required", 403);
          if (/authentication|session/i.test(message)) return errorResponse("Authentication required", 401);
          console.error("[bridge-super-admin-verify] failed", { message });
          return errorResponse("Object verification or sealing failed", 502);
        }
      },
    },
  },
});
