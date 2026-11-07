export function authConfigResponse(authUrl?: string | null): Response {
  const configured = typeof authUrl === "string" && authUrl.trim().length > 0;
  return new Response(
    JSON.stringify({
      status: configured ? "active" : "unavailable",
      authority: "supabase",
      authUrl: configured ? authUrl : null,
    }),
    {
      status: configured ? 200 : 503,
      headers: { "Content-Type": "application/json" },
    },
  );
}
