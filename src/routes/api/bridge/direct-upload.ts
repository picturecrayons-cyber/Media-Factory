import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/verify.server";
import { loadActor, requireVerifiedActor } from "@/lib/bridge/session";
import { assertNotDevUser } from "@/lib/bridge/guards";
import { loadTitle } from "@/lib/bridge/titles";
import { writeAudit } from "@/lib/bridge/audit";
import { signUpload, verifyObject, sealVerifiedObject, titleAssetKey } from "@/lib/bridge/oci-object-storage.server";

const KINDS = new Set(["main_film", "trailer", "poster_vertical", "poster_horizontal", "thumbnail"]);
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/bridge/direct-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

          const form = await request.formData();
          const file = form.get("file");
          const titleId = form.get("title_id");
          const requestedKind = form.get("kind");
          if (!(file instanceof File) || typeof titleId !== "string" || !titleId || typeof requestedKind !== "string" || !KINDS.has(requestedKind)) {
            return jsonError("Valid file, title_id, and kind are required", 400);
          }
          if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
            return jsonError("File must be between 1 byte and 100 MB for this server upload route", 413);
          }

          const kind = requestedKind === "main_film" ? "master" : requestedKind === "trailer" ? "screener" : requestedKind;
          const allowedType = requestedKind === "main_film" || requestedKind === "trailer"
            ? file.type.startsWith("video/")
            : file.type.startsWith("image/");
          if (!allowedType) return jsonError("File type does not match the selected asset kind", 415);

          const title = await loadTitle(titleId);
          if (!title || !["DRAFT", "UPLOADING", "PREPARING"].includes(title.status)) {
            return jsonError("Title not found or uploads are closed for this title status", 404);
          }

          const sql = await getSql();
          const key = titleAssetKey({ ownerUserId: title.ownerUserId, titleId: title.id, kind, filename: file.name });
          const signed = await signUpload({ key, contentType: file.type || "application/octet-stream", expiresIn: 300 });
          const bytes = Buffer.from(await file.arrayBuffer());
          const uploaded = await fetch(signed.url, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: bytes,
            signal: AbortSignal.timeout(120_000),
          });
          if (!uploaded.ok) return jsonError("OCI upload failed; asset was not registered", 502);

          const head = await verifyObject(key, file.type || "application/octet-stream");
          if (head.byteSize !== file.size || !head.etag) {
            return jsonError("OCI object verification did not match the uploaded file; asset was not registered", 502);
          }
          const assetId = randomBytes(16).toString("hex");
          const sealedKey = `${key}.verified/${assetId}`;
          const sealed = await sealVerifiedObject(key, sealedKey, head.etag);
          if (sealed.byteSize !== head.byteSize || !sealed.etag) {
            return jsonError("Sealed OCI copy failed verification; asset was not registered", 502);
          }

          // Persist only after upload, HEAD verification, and immutable-copy verification.
          // The current schema lifecycle records byte_size as the durable verified marker;
          // do not write an unconfirmed storage_business_state column from this route.
          await sql`
            insert into bridge_assets (id, title_id, kind, s3_key, content_type, byte_size, created_by)
            values (${assetId}, ${title.id}, ${kind}, ${sealedKey}, ${sealed.contentType ?? file.type}, ${sealed.byteSize}, ${actor.userId})
          `;
          await writeAudit({
            actorUserId: actor.userId,
            action: "asset.upload_verified",
            entityType: "bridge_asset",
            entityId: assetId,
            metadata: { titleId: title.id, kind, byteSize: sealed.byteSize, checksum: sealed.etag },
          });
          return Response.json({
            assetId,
            verified: true,
            storage_business_state: "VERIFIED",
            byte_size: sealed.byteSize,
          }, { status: 201 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          const status = /access required|forbidden/i.test(message) ? 403 : /authentication|session/i.test(message) ? 401 : 500;
          return jsonError(status === 500 ? "Upload failed during server-side verification or persistence" : message, status);
        }
      },
    },
  },
});
