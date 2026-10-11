import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { bridgeEnv } from "@/lib/bridge/env";
import { signDownload } from "@/lib/bridge/oci-object-storage.server";

type MediaType = "master" | "poster" | "trailer";

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ success: false, code, error: message }, { status });
}

async function serveLoopMedia(request: Request) {
  if (request.method !== "GET") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const url = new URL(request.url);
  const requestedTitle = (url.searchParams.get("titleId") || "").trim();
  const mediaType = (url.searchParams.get("mediaType") || "master").toLowerCase() as MediaType;
  if (!requestedTitle || requestedTitle.length > 200) {
    return errorResponse(400, "TITLE_REQUIRED", "A Loop title ID is required");
  }
  if (!["master", "poster", "trailer"].includes(mediaType)) {
    return errorResponse(400, "MEDIA_TYPE_INVALID", "Unsupported media type");
  }

  const supabaseUrl = bridgeEnv.supabaseUrl();
  const anonKey = bridgeEnv.supabaseAnon();
  const serviceKey = bridgeEnv.supabaseService();
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return errorResponse(503, "BRIDGE_MEDIA_UNAVAILABLE", "Bridge media authorization is not configured");
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId: string | null = null;
  if (mediaType === "master") {
    const token = bearerToken(request);
    if (!token) return errorResponse(401, "AUTH_REQUIRED", "Sign in to watch this title");
    const auth = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) {
      return errorResponse(401, "INVALID_SESSION", "Your session is invalid or expired");
    }
    userId = data.user.id;
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedTitle);
  const { data: title, error: titleError } = await service
    .from("loop_titles")
    .select("id,bridge_title_id,status,listed,published,access_tier")
    .eq(isUuid ? "id" : "slug", requestedTitle)
    .maybeSingle();

  if (titleError) return errorResponse(503, "BRIDGE_CATALOG_UNAVAILABLE", "Bridge could not verify this title");
  if (!title || title.status !== "approved" || title.listed !== true || title.published !== true || !title.bridge_title_id) {
    return errorResponse(403, "TITLE_NOT_AVAILABLE", "This title is not available for Loop playback");
  }

  const now = new Date();
  const { data: grant, error: grantError } = await service
    .from("bridge_loop_publications")
    .select("territories,exploitation_models,window_start,window_end,approved_at,revoked_at,authorization_status")
    .eq("loop_title_id", title.id)
    .eq("bridge_title_id", title.bridge_title_id)
    .eq("authorization_status", "authorized")
    .is("revoked_at", null)
    .not("approved_at", "is", null)
    .maybeSingle();

  if (grantError) return errorResponse(503, "BRIDGE_AUTHORIZATION_UNAVAILABLE", "Bridge publication authorization could not be verified");
  if (!grant) return errorResponse(403, "BRIDGE_GRANT_REQUIRED", "Bridge has not authorized this title for Loop");

  const windowStart = grant.window_start ? new Date(grant.window_start).getTime() : null;
  const windowEnd = grant.window_end ? new Date(grant.window_end).getTime() : null;
  const territoryAllowed = grant.territories?.includes("WORLDWIDE") || grant.territories?.includes("IN");
  const modelAllowed = Boolean(title.access_tier && grant.exploitation_models?.includes(title.access_tier));
  if ((windowStart !== null && windowStart > now.getTime()) ||
      (windowEnd !== null && windowEnd <= now.getTime()) ||
      !territoryAllowed || !modelAllowed) {
    return errorResponse(403, "BRIDGE_GRANT_OUT_OF_SCOPE", "The Bridge publication grant does not cover this request");
  }

  if (mediaType === "master") {
    if (title.access_tier !== "TVOD") {
      return errorResponse(403, "TVOD_ONLY", "Full-film playback requires an authorized TVOD title");
    }
    const { data: entitlements, error: entitlementError } = await service
      .from("loop_user_tvod_entitlements")
      .select("expires_at")
      .eq("user_id", userId)
      .eq("title_id", title.id)
      .eq("status", "ACTIVE")
      .eq("access_type", "RENTAL")
      .gt("expires_at", now.toISOString())
      .limit(1);
    if (entitlementError) return errorResponse(503, "ENTITLEMENT_UNAVAILABLE", "Rental entitlement could not be verified");
    if (!entitlements?.length) {
      return errorResponse(403, "ENTITLEMENT_REQUIRED", "A current rental is required to watch this title");
    }
  }

  const { data: bridgeTitle, error: bridgeTitleError } = await service
    .from("bridge_titles")
    .select("master_key,poster_key")
    .eq("id", title.bridge_title_id)
    .maybeSingle();
  if (bridgeTitleError) return errorResponse(503, "BRIDGE_ASSET_LOOKUP_FAILED", "Bridge could not resolve the approved media asset");
  if (!bridgeTitle) return errorResponse(404, "BRIDGE_TITLE_NOT_FOUND", "The Bridge title record was not found");

  const objectKey = mediaType === "master"
    ? bridgeTitle.master_key
    : mediaType === "poster"
      ? bridgeTitle.poster_key
      : null;
  if (!objectKey || typeof objectKey !== "string") {
    return errorResponse(404, "BRIDGE_ASSET_NOT_READY", "The requested media asset is not verified in Bridge storage");
  }

  try {
    const signed = await signDownload({ key: objectKey, expiresIn: 300 });
    return Response.json({
      success: true,
      titleId: title.id,
      mediaType,
      streamUrl: signed.url,
      expiresInSeconds: 300,
      storageAuthority: "bridge-oci",
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return errorResponse(503, "BRIDGE_STORAGE_UNAVAILABLE", "Bridge storage is temporarily unavailable");
  }
}

export const Route = createFileRoute("/api/loop/media")({
  server: {
    handlers: {
      GET: async ({ request }) => serveLoopMedia(request),
    },
  },
});
