import { createFileRoute } from "@tanstack/react-router";
import { bridgeEnv } from "@/lib/bridge/env";

function authStatusResponse(): Response {
  const authUrl = bridgeEnv.supabaseUrl();
  return Response.json({
    status: authUrl ? "active" : "unconfigured",
    authority: "supabase",
    authUrl: authUrl ?? null,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: () => authStatusResponse(),
      POST: () => authStatusResponse(),
    },
  },
});
