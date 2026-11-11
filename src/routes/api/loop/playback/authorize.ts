import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { signDownload } from "@/lib/bridge/oci-object-storage.server";
import { verifyDistributionPreflight } from "@/lib/bridge/loop-publication";
import { verifyLoopPlaybackHandoffSignature } from "@/lib/bridge/loop-playback-handoff.server";

type HandoffRequest = {
  bridgeTitleId?: string;
  loopTitleId?: string;
  mediaType?: "video" | "poster" | "trailer";
  objectKey?: string;
};

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

export const Route = createFileRoute("/api/loop/playback/authorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
          return jsonError("JSON request required", "INVALID_CONTENT_TYPE", 415);
        }

        const rawBody = await request.text();
        if (rawBody.length > 8_192) return jsonError("Request too large", "REQUEST_TOO_LARGE", 413);
        const signatureValid = verifyLoopPlaybackHandoffSignature({
          rawBody,
          timestamp: request.headers.get("x-bridge-timestamp"),
          signature: request.headers.get("x-bridge-signature"),
        });
        if (!signatureValid) return jsonError("Invalid service authentication", "SERVICE_AUTH_REQUIRED", 401);

        let input: HandoffRequest;
        try {
          input = JSON.parse(rawBody) as HandoffRequest;
        } catch {
          return jsonError("Invalid JSON body", "INVALID_REQUEST", 400);
        }

        const bridgeTitleId = typeof input.bridgeTitleId === "string" ? input.bridgeTitleId.trim() : "";
        const loopTitleId = typeof input.loopTitleId === "string" ? input.loopTitleId.trim() : "";
        const objectKey = typeof input.objectKey === "string" ? input.objectKey.trim().replace(/^\\//, "") : "";
        const mediaType = input.mediaType || "video";
        if (!["video", "poster", "trailer"].includes(mediaType) ||
            (mediaType === "video" && (!bridgeTitleId || !loopTitleId)) ||
            (mediaType !== "video" && !((bridgeTitleId && loopTitleId) || objectKey))) {
          return jsonError("Valid title identity or a canonical public asset key is required", "INVALID_REQUEST", 400);
        }

        try {
          const sql = await getSql();
          const rows = await sql<{
            bridge_title_id: string;
            loop_title_id: string;
            authorization_status: string;
            territories: string[];
            languages: string[];
            exploitation_models: string[];
            window_start: string | Date | null;
            window_end: string | Date | null;
            approved_at: string | Date | null;
            revoked_at: string | Date | null;
            title_status: string;
            language: string;
            master_key: string | null;
            poster_key: string | null;
          }>`
            select p.bridge_title_id, p.loop_title_id, p.authorization_status,
                   p.territories, p.languages, p.exploitation_models,
                   p.window_start, p.window_end, p.approved_at, p.revoked_at,
                   b.status as title_status, b.language, b.master_key, b.poster_key
            from bridge_loop_publications p
            join bridge_titles b on b.id = p.bridge_title_id
            where (${bridgeTitleId || null}::text is null or p.bridge_title_id = ${bridgeTitleId || null})
              and (${loopTitleId || null}::text is null or p.loop_title_id = ${loopTitleId || null})
              and (
                ${mediaType === "poster" && objectKey ? objectKey : null}::text is null
                or b.poster_key = ${mediaType === "poster" && objectKey ? objectKey : null}
              )
              and (
                ${mediaType === "trailer" && objectKey ? objectKey : null}::text is null
                or exists (
                  select 1 from bridge_assets a
                  where a.title_id = b.id and a.kind = 'trailer' and a.s3_key = ${mediaType === "trailer" && objectKey ? objectKey : null}
                    and coalesce(a.byte_size, 0) > 0
                )
              )
            limit 1
          `;
          const publication = rows[0];
          const now = Date.now();
          const windowStart = publication?.window_start ? new Date(publication.window_start).getTime() : 0;
          const windowEnd = publication?.window_end ? new Date(publication.window_end).getTime() : 0;
          if (!publication ||
              !["authorized", "live"].includes(String(publication.authorization_status).toLowerCase()) ||
              publication.revoked_at || !publication.approved_at ||
              !Number.isFinite(windowStart) || !Number.isFinite(windowEnd) ||
              windowStart > now || windowEnd <= now) {
            return jsonError("Bridge publication is not currently authorized", "BRIDGE_PUBLICATION_BLOCKED", 403);
          }

          let objectKey: string | null = null;
          let expiresIn = 300;
          if (mediaType === "video") {
            const preflight = await verifyDistributionPreflight(sql, bridgeTitleId, {
              destination: "CRAYONS_LOOP",
              territories: publication.territories || [],
              languages: publication.languages || [],
              exploitationModels: publication.exploitation_models || [],
              windowStart: publication.window_start ? new Date(publication.window_start).toISOString() : null,
              windowEnd: publication.window_end ? new Date(publication.window_end).toISOString() : null,
            });
            if (!preflight.eligible || !preflight.title?.master_key) {
              return jsonError("Bridge rights, QC, legal or master checks are not satisfied", "BRIDGE_PREFLIGHT_BLOCKED", 403);
            }
            if (!publication.exploitation_models?.includes("TVOD")) {
              return jsonError("TVOD is not authorized for this publication", "TVOD_NOT_AUTHORIZED", 403);
            }
            objectKey = preflight.title.master_key;
          } else if (mediaType === "poster") {
            objectKey = publication.poster_key && (!objectKey || objectKey === publication.poster_key) ? publication.poster_key : null;
            expiresIn = 3_600;
          } else {
            const assets = await sql<{ s3_key: string }>`
              select s3_key from bridge_assets
              where title_id = ${publication.bridge_title_id} and kind = 'trailer'
                and coalesce(byte_size, 0) > 0
                and (${objectKey || null}::text is null or s3_key = ${objectKey || null})
              limit 1
            `;
            objectKey = assets[0]?.s3_key || null;
            expiresIn = 3_600;
          }

          if (!objectKey) return jsonError("Requested Bridge media asset is unavailable", "BRIDGE_ASSET_NOT_FOUND", 404);
          const signed = await signDownload({ key: objectKey, expiresIn });
          return Response.json({
            success: true,
            streamUrl: signed.url,
            method: "GET",
            expiresInSeconds: expiresIn,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          });
        } catch {
          return jsonError("Bridge playback authorization is temporarily unavailable", "BRIDGE_HANDOFF_UNAVAILABLE", 503);
        }
      },
    },
  },
});
