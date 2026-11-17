import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { processNextAssetVerificationJob } from "@/lib/bridge/asset-verification-worker.server";

function authorized(request: Request) {
  const secret = process.env.BRIDGE_ASSET_VERIFICATION_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || !supplied) return false;
  const expectedBytes = Buffer.from(secret, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export const Route = createFileRoute("/api/internal/asset-verification-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const results: Array<{ processed: boolean; assetId?: string }> = [];
        try {
          for (let i = 0; i < 10; i += 1) {
            const result = await processNextAssetVerificationJob();
            if (!result.processed) break;
            results.push(result);
          }
          return Response.json({ ok: true, processed: results.length, results }, {
            headers: { "cache-control": "no-store" },
          });
        } catch {
          return Response.json({ error: "Asset verification worker failed" }, {
            status: 500,
            headers: { "cache-control": "no-store" },
          });
        }
      },
    },
  },
});
