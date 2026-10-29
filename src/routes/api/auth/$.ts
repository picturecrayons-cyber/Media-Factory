import { createFileRoute } from "@tanstack/react-router";
import { resolveEnvironmentScopedSupabaseUrl } from "../../../lib/supabase-url.ts";

function authConfigResponse(): Response {
  try {
    const authUrl = resolveEnvironmentScopedSupabaseUrl(
      process.env.VERCEL_ENV ?? process.env.BRIDGE_DEPLOYMENT_ENV,
      process.env.VITE_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
    return new Response(
      JSON.stringify({ status: "active", authority: "supabase", authUrl }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch {
    // Never advertise or silently fall back to a different Supabase project.
    return new Response(
      JSON.stringify({ status: "unavailable", error: "AUTH_CONFIGURATION_UNAVAILABLE" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: () => authConfigResponse(),
      POST: () => authConfigResponse(),
    },
  },
});
