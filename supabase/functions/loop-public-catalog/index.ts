import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";

const admin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "GET") {
    return json(405, { success: false, code: "METHOD_NOT_ALLOWED" });
  }
  if (!admin) {
    return json(503, { success: false, code: "CATALOG_UNAVAILABLE" });
  }

  try {
    const { data, error } = await admin.rpc("public_loop_catalog");
    if (error || !Array.isArray(data)) {
      console.error("loop-public-catalog RPC failed", { code: error?.code || "INVALID_RESULT" });
      return json(503, { success: false, code: "CATALOG_UNAVAILABLE" });
    }

    const titles = data
      .filter((row: Record<string, unknown>) =>
        typeof row.id === "string" &&
        typeof row.bridge_title_id === "string" &&
        typeof row.slug === "string" &&
        typeof row.title === "string" &&
        String(row.status || "").toLowerCase() === "approved" &&
        row.listed === true &&
        row.published === true
      )
      .map((row: Record<string, unknown>) => ({
        id: row.id,
        bridge_title_id: row.bridge_title_id,
        slug: row.slug,
        title: row.title,
        synopsis: row.synopsis ?? null,
        description: row.description ?? null,
        content_type: row.content_type ?? "Film",
        language: row.language ?? null,
        year: row.year ?? null,
        duration_minutes: row.duration_minutes ?? null,
        maturity_rating: row.maturity_rating ?? null,
        director: row.director ?? null,
        is_original: row.is_original === true,
        original_badge: row.original_badge ?? null,
        status: "approved",
        listed: true,
        published: true,
        featured: row.featured === true,
        access_tier: row.access_tier ?? null,
        tvod_rental_price: row.tvod_rental_price ?? null,
        poster_available: row.poster_available === true,
        backdrop_available: row.backdrop_available === true,
        trailer_available: row.trailer_available === true,
      }));

    return json(200, { success: true, count: titles.length, titles });
  } catch {
    console.error("loop-public-catalog unexpected failure");
    return json(503, { success: false, code: "CATALOG_UNAVAILABLE" });
  }
});
