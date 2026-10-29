import { createFileRoute } from "@tanstack/react-router";
import {
  CANONICAL_SUPABASE_URL,
  resolveTestAuthSupabaseUrl,
} from "@/lib/bridge/canonical";

function authStatusResponse(): Response {
  const testAuthEnabled =
    process.env.VITE_TEST_AUTH_ENABLED === "true" ||
    process.env.TEST_AUTH_ENABLED === "true";
  const testAuthUrl =
    process.env.TEST_AUTH_SUPABASE_URL ||
    process.env.VITE_TEST_AUTH_SUPABASE_URL;
  const testAuthPublishableKey =
    process.env.TEST_AUTH_SERVER_PUBLISHABLE_KEY ||
    process.env.VITE_TEST_AUTH_SUPABASE_PUBLISHABLE_KEY;

  const authUrl = testAuthEnabled
    ? resolveTestAuthSupabaseUrl(true, testAuthUrl, testAuthPublishableKey)
    : CANONICAL_SUPABASE_URL;

  return new Response(
    JSON.stringify({
      status: "active",
      authority: "supabase",
      authUrl,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: () => authStatusResponse(),
      POST: () => authStatusResponse(),
    },
  },
});
