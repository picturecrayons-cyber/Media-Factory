import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { claimNextDitConversionJob, completeDitConversionJob, failDitConversionJob } from "@/lib/bridge/dit-operations.server";

function authorized(request: Request) {
  const expected = process.env.DIT_WORKER_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/dit/worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          const body = await request.json() as Record<string, unknown>;
          if (body.action === "claim") {
            const result = await claimNextDitConversionJob(String(body.workerId ?? ""));
            return Response.json(result);
          }
          if (body.action === "complete") {
            const result = await completeDitConversionJob(body as never);
            return Response.json(result);
          }
          if (body.action === "fail") {
            const result = await failDitConversionJob(String(body.jobId ?? ""), String(body.reason ?? "Worker failed"));
            return Response.json(result);
          }
          return Response.json({ error: "Unsupported worker action" }, { status: 400 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "DIT worker operation failed";
          const blocked = /DIT_WRITE_BLOCKED|DIT_REPLICATION_BLOCKED/.test(message);
          return Response.json({ error: blocked ? message : "DIT worker operation failed" }, { status: blocked ? 503 : 409 });
        }
      },
    },
  },
});
