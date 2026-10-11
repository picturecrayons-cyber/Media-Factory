import { createFileRoute } from "@tanstack/react-router";
import { evaluateStorageController } from "@/lib/bridge/storage-controller";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  return Boolean(secret && header === `Bearer ${secret}`);
}

async function run(request: Request) {
  if (!authorized(request)) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  const result = await evaluateStorageController();
  return Response.json({ success: true, mode: "DRY_RUN", ...result });
}

export const Route = createFileRoute("/api/cron/storage-optimizer")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
