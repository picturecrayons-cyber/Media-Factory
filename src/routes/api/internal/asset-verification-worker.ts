import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { processNextAssetVerificationJob } from "@/lib/bridge/asset-verification-worker.server";

function authorized(request: Request) {
  const candidates = [
    process.env.BRIDGE_ASSET_VERIFICATION_WORKER_SECRET,
    process.env.CRON_SECRET,
  ].filter((value): value is string => Boolean(value && Buffer.byteLength(value, "utf8") >= 32));
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return candidates.some((secret) => {
    const expected = Buffer.from(secret, "utf8");
    return expected.length === suppliedBytes.length && timingSafeEqual(expected, suppliedBytes);
  });
}

async function runBatch(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const results: Array<{ processed: boolean; assetId?: string }> = [];
  try {
    for (let i = 0; i < 10; i += 1) {
      const result = await processNextAssetVerificationJob();
      if (!result.processed) break;
      results.push(result);
    }
    return Response.json({ ok: true, processed: results.length, results }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "Asset verification worker failed" }, {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}

export const Route = createFileRoute("/api/internal/asset-verification-worker")({
  server: {
    handlers: {
      GET: async ({ request }) => runBatch(request),
      POST: async ({ request }) => runBatch(request),
    },
  },
});
