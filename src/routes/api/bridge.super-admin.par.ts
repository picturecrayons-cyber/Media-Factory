import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "node:crypto";
import { getSessionUser } from "@/lib/auth/verify.server";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { assertNotDevUser } from "@/lib/bridge/guards";
import { getSql } from "@/lib/db";
import { loadTitle } from "@/lib/bridge/titles";
import { writeAudit } from "@/lib/bridge/audit";
import { signUpload, titleAssetKey } from "@/lib/bridge/oci-object-storage.server";

const KIND_MAP = {
  main_film: { kind: "master", types: ["video/"] },
  trailer: { kind: "screener", types: ["video/"] },
  poster_vertical: { kind: "poster_vertical", types: ["image/"] },
  poster_horizontal: { kind: "poster_horizontal", types: ["image/"] },
  thumbnail: { kind: "thumbnail", types: ["image/"] },
} as const;
type RequestedKind = keyof typeof KIND_MAP;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function superAdmin(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const user = await getSessionUser(token);
  if (!user) return { response: errorResponse("Authentication required", 401) } as const;
  assertNotDevUser(user.id);
  const actor = await requireVerifiedActor(user.id);
  if (actor.internalRole !== "super_admin" || actor.emailVerified !== true || !user.email_confirmed_at) {
    return { response: errorResponse("Verified super-admin access required", 403) } as const;
  }
  return { user, actor } as const;
}

export const Route = createFileRoute("/api/bridge/super-admin/par")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await superAdmin(request);
          if ("response" in auth) return auth.response;
          const input = await request.json() as {
            title_id?: unknown; kind?: unknown; filename?: unknown; content_type?: unknown; byte_size?: unknown;
          };
          if (typeof input.title_id !== "string" || input.title_id.length < 8 ||
              typeof input.kind !== "string" || !(input.kind in KIND_MAP) ||
              typeof input.filename !== "string" || !input.filename.trim() || input.filename.length > 180 ||
              typeof input.content_type !== "string" || input.content_type.length > 120 ||
              typeof input.byte_size !== "number" || !Number.isSafeInteger(input.byte_size) || input.byte_size <= 0) {
            return errorResponse("Valid title_id, kind, filename, content_type, and positive byte_size are required", 400);
          }
          const requestedKind = input.kind as RequestedKind;
          const kindInfo = KIND_MAP[requestedKind];
          if (!kindInfo.types.some((prefix) => input.content_type!.startsWith(prefix))) {
            return errorResponse("File type does not match the selected asset kind", 415);
          }
          // Hard cap is deliberately generous for film uploads; transfer bytes go browser -> OCI,
          // never through this serverless request body.
          if (input.byte_size > 100 * 1024 * 1024 * 1024) return errorResponse("File exceeds the 100 GiB upload limit", 413);

          const title = await loadTitle(input.title_id);
          if (!title || !["DRAFT", "UPLOADING", "PREPARING"].includes(title.status)) {
            return errorResponse("Title not found or uploads are closed for this title status", 404);
          }
          const key = titleAssetKey({
            ownerUserId: title.ownerUserId,
            titleId: title.id,
            kind: kindInfo.kind,
            filename: input.filename,
          });
          const signed = await signUpload({ key, contentType: input.content_type, expiresIn: 900 });
          const assetId = randomBytes(16).toString("hex");
          const sql = await getSql();
          await sql`
            insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
            values (${assetId}, ${title.id}, ${kindInfo.kind}, ${key}, ${input.content_type}, ${auth.actor.userId})
          `;
          await writeAudit({
            actorUserId: auth.actor.userId,
            action: "asset.upload_par_created",
            entityType: "bridge_asset",
            entityId: assetId,
            metadata: { titleId: title.id, kind: kindInfo.kind, expectedByteSize: input.byte_size },
          });
          return Response.json({
            assetId,
            parUrl: signed.url,
            s3_key: key,
            method: "PUT",
            expiresIn: 900,
          }, { status: 201, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (/super-admin|forbidden|access required|not authorized|profile|dev user|development user/i.test(message)) return errorResponse("Verified super-admin access required", 403);
          if (/authentication|session/i.test(message)) return errorResponse("Authentication required", 401);
          console.error("[bridge-super-admin-par] failed", { message });
          return errorResponse("Could not prepare OCI upload", 500);
        }
      },
    },
  },
});
