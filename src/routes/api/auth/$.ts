import { createFileRoute } from "@tanstack/react-router";
import { resolveBridgeSupabaseUrl } from "../../../lib/bridge/canonical.ts";

function authStatusResponse() {
  const authUrl = resolveBridgeSupabaseUrl(process.env);
  return new Response(
    JSON.stringify({ status: "active", authority: "supabase", authUrl }),
    { headers: { "Content-Type": "application/json" } },
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
