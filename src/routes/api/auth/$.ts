import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          JSON.stringify({
            status: "active",
            authority: "supabase",
            authUrl: "https://mlmgugivsyoxzdgwkbpu.supabase.co",
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      POST: () =>
        new Response(
          JSON.stringify({
            status: "active",
            authority: "supabase",
            authUrl: "https://mlmgugivsyoxzdgwkbpu.supabase.co",
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    },
  },
});
