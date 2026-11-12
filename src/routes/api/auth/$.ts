import { createFileRoute } from "@tanstack/react-router";
import { bridgeEnv } from "../../../lib/bridge/env.ts";

function authStatusResponse(): Response {
  const authUrl = bridgeEnv.supabaseUrl();
  const headers = { "Content-Type": "application/json" };

  if (!authUrl) {
    return new Response(
      JSON.stringify({
        status: "unavailable",
        authority: "supabase",
        error: "SUPABASE_URL_NOT_CONFIGURED",
      }),
      { status: 503, headers },
    );
  }

  return new Response(
    JSON.stringify({
      status: "active",
      authority: "supabase",
      authUrl,
    }),
    { headers },
  );
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: authStatusResponse,
      POST: authStatusResponse,
    },
  },
});
