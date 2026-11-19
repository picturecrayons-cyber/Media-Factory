import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { bridgeEnv } from "@/lib/bridge/env";
import { fetchObjectResponse, signDownload, verifyObject } from "@/lib/bridge/oci-object-storage.server";
import { parseSingleByteRange, validateMediaResponse } from "@/lib/bridge/media-range";

type MediaType = "master" | "poster";
type Row = Record<string, unknown>;

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ success: false, code, error: message }, { status });
}

function eligibleMaster(asset: Row, objectKey: string) {
  if (asset.s3_key !== objectKey || !String(asset.content_type || "").toLowerCase().startsWith("video/")) return false;
  if (!Number.isSafeInteger(Number(asset.byte_size)) || Number(asset.byte_size) <= 0) return false;
  if (asset.storage_provider && String(asset.storage_provider).toUpperCase() !== "OCI") return false;
  if (Object.prototype.hasOwnProperty.call(asset, "verified_object_key") && asset.verified_object_key !== objectKey) return false;
  if (Object.prototype.hasOwnProperty.call(asset, "storage_verified_at") && !asset.storage_verified_at) return false;
  if (asset.storage_business_state && asset.storage_business_state !== "ACTIVE") return false;
  if (asset.restore_state && asset.restore_state !== "READY") return false;
  if (asset.legal_hold === true || asset.commercial_hold === true) return false;
  return true;
}

function qcMatches(qcRows: Row[], objectKey: string) {
  return qcRows.some((qc) =>
    qc.status === "PASSED" &&
    Array.isArray(qc.reviewer_findings) &&
    qc.reviewer_findings.some((finding: unknown) =>
      Boolean(finding && typeof finding === "object" &&
        (finding as Record<string, unknown>).masterKey === objectKey),
    ),
  );
}

async function serveLoopMedia(request: Request) {
  if (request.method !== "GET") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const url = new URL(request.url);
  const requestedTitle = (url.searchParams.get("titleId") || "").trim();
  const mediaType = (url.searchParams.get("mediaType") || "master").trim().toLowerCase() as MediaType;
  const delivery = (url.searchParams.get("delivery") || (mediaType === "master" ? "proxy" : "signed-url")).trim().toLowerCase();
  if (!requestedTitle || requestedTitle.length > 200) {
    return errorResponse(400, "TITLE_REQUIRED", "A Loop title ID is required");
  }
  if (!["master", "poster"].includes(mediaType)) {
    return errorResponse(400, "MEDIA_TYPE_INVALID", "Unsupported media type");
  }
  if (!["signed-url", "proxy"].includes(delivery) || (mediaType === "master" && delivery !== "proxy") ||
      (mediaType === "poster" && delivery !== "signed-url")) {
    return errorResponse(400, "DELIVERY_MODE_INVALID", "Unsupported media delivery mode");
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
    .select("*")
    .eq(isUuid ? "id" : "slug", requestedTitle)
    .maybeSingle();

  if (titleError) return errorResponse(503, "BRIDGE_CATALOG_UNAVAILABLE", "Bridge could not verify this title");
  const titleStatus = String(title?.status || "").trim().toUpperCase();
  if (!title || !["APPROVED", "PUBLISHED"].includes(titleStatus) ||
      (title.listed ?? title.is_listed) !== true ||
      (title.published ?? title.is_published) !== true ||
      !title.bridge_title_id) {
    return errorResponse(403, "TITLE_NOT_AVAILABLE", "This title is not available for Loop playback");
  }

  const now = new Date();
  const { data: grantRows, error: grantError } = await service
    .from("bridge_loop_publications")
    .select("*")
    .eq("loop_title_id", title.id)
    .eq("bridge_title_id", title.bridge_title_id);

  if (grantError || !Array.isArray(grantRows)) {
    return errorResponse(503, "BRIDGE_AUTHORIZATION_UNAVAILABLE", "Bridge publication authorization could not be verified");
  }
  const validGrants = grantRows.filter((row: Row) =>
    String(row.authorization_status || "").trim().toUpperCase() === "AUTHORIZED" &&
    Boolean(row.approved_at) &&
    row.revoked_at == null &&
    (!Object.prototype.hasOwnProperty.call(row, "destination") || row.destination === "CRAYONS_LOOP"),
  );
  if (validGrants.length !== 1) {
    return errorResponse(403, "BRIDGE_GRANT_REQUIRED", "Bridge has not authorized this title for Loop");
  }
  const grant = validGrants[0];

  const windowStart = grant.window_start ? Date.parse(String(grant.window_start)) : Number.NaN;
  const windowEnd = grant.window_end ? Date.parse(String(grant.window_end)) : Number.NaN;
  const approvedAt = grant.approved_at ? Date.parse(String(grant.approved_at)) : Number.NaN;
  const requestCountry = (request.headers.get("x-vercel-ip-country") || "").trim().toUpperCase();
  const allowedTerritories = Array.isArray(grant.territories) ? grant.territories : [];
  const normalizedTerritories = allowedTerritories.map((value: unknown) => String(value).trim().toUpperCase());
  const territoryAllowed = normalizedTerritories.includes("WORLDWIDE") ||
    (requestCountry.length === 2 && normalizedTerritories.includes(requestCountry));
  const titleLanguage = String(title.language || "").trim().toUpperCase();
  const languageAllowed = Boolean(titleLanguage && Array.isArray(grant.languages) &&
    grant.languages.some((value: unknown) => String(value).trim().toUpperCase() === titleLanguage));
  const modelAllowed = Boolean(title.access_tier && Array.isArray(grant.exploitation_models) &&
    grant.exploitation_models.some((value: unknown) =>
      String(value).trim().toUpperCase() === String(title.access_tier).trim().toUpperCase(),
    ));
  if (!Number.isFinite(approvedAt) || !Number.isFinite(windowStart) || !Number.isFinite(windowEnd) ||
      approvedAt > now.getTime() ||
      windowStart > now.getTime() || windowEnd <= now.getTime() || windowEnd <= windowStart ||
      !territoryAllowed || !languageAllowed || !modelAllowed) {
    return errorResponse(403, "BRIDGE_GRANT_OUT_OF_SCOPE", "The Bridge publication grant does not cover this request");
  }

  if (mediaType === "master") {
    if (String(title.access_tier).toUpperCase() !== "TVOD") {
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

  const objectKey = mediaType === "master" ? bridgeTitle.master_key : bridgeTitle.poster_key;
  if (!objectKey || typeof objectKey !== "string") {
    return errorResponse(404, "BRIDGE_ASSET_NOT_READY", "The requested media asset is not verified in Bridge storage");
  }

  if (delivery === "proxy") {
    const [assetResult, qcResult] = await Promise.all([
      service.from("bridge_assets").select("*").eq("title_id", title.bridge_title_id).eq("kind", "master"),
      service.from("bridge_qc_cases").select("status,reviewer_findings").eq("title_id", title.bridge_title_id).eq("status", "PASSED"),
    ]);
    if (assetResult.error || qcResult.error || !Array.isArray(assetResult.data) || !Array.isArray(qcResult.data)) {
      return errorResponse(503, "BRIDGE_ASSET_LOOKUP_FAILED", "Bridge could not verify the approved master record");
    }
    const eligibleAssets = assetResult.data.filter((asset: Row) => eligibleMaster(asset, objectKey));
    if (eligibleAssets.length !== 1 || !qcMatches(qcResult.data as Row[], objectKey)) {
      return errorResponse(404, "BRIDGE_ASSET_NOT_READY", "No unique QC-approved verified master is available");
    }

    const asset = eligibleAssets[0];
    const size = Number(asset.byte_size);
    const expectedType = String(asset.content_type).split(";")[0].trim().toLowerCase();
    let requestedRange: { start: number; end: number } | null;
    try {
      requestedRange = parseSingleByteRange(request.headers.get("range"), size);
    } catch {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "private, no-store" },
      });
    }

    // Verify the live OCI object independently before serving any master bytes.
    // This is metadata/readiness verification; the approved fixture E2E must still
    // establish actual byte read-back and checksum evidence.
    try {
      const verified = await verifyObject(objectKey);
      const verifiedType = String(verified.contentType || "").split(";")[0].trim().toLowerCase();
      const expectedEtag = typeof asset.storage_etag === "string" ? asset.storage_etag.replaceAll('"', "") :
        typeof asset.etag === "string" ? asset.etag.replaceAll('"', "") : null;
      if (verified.byteSize !== size || verifiedType !== expectedType ||
          (expectedEtag && verified.etag !== expectedEtag)) {
        return errorResponse(502, "BRIDGE_STORAGE_INTEGRITY_MISMATCH", "The OCI object metadata did not match the approved Bridge asset record");
      }
    } catch {
      return errorResponse(503, "BRIDGE_ASSET_VERIFICATION_FAILED", "Bridge could not verify the master object in OCI storage");
    }

    let upstream: Response;
    try {
      const rangeHeader = requestedRange ? `bytes=${requestedRange.start}-${requestedRange.end}` : undefined;
      upstream = await fetchObjectResponse(objectKey, typeof asset.storage_bucket === "string" ? asset.storage_bucket : undefined, rangeHeader);
    } catch {
      return errorResponse(503, "BRIDGE_STORAGE_UNAVAILABLE", "Bridge storage is temporarily unavailable");
    }
    if (![200, 206].includes(upstream.status) || !upstream.body) {
      await upstream.body?.cancel();
      return errorResponse(502, "BRIDGE_STORAGE_READ_FAILED", "Bridge could not stream the verified master");
    }

    const upstreamType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const contentRange = upstream.headers.get("content-range");
    if (!validateMediaResponse({
      status: upstream.status,
      contentRange,
      contentLength: upstream.headers.get("content-length"),
      requestedRange,
      totalBytes: size,
      expectedContentType: expectedType,
      actualContentType: upstreamType,
    })) {
      await upstream.body.cancel();
      return errorResponse(502, "BRIDGE_STORAGE_INTEGRITY_MISMATCH", "The streamed object did not match the exact approved byte range and Bridge asset record");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": expectedType,
        "Content-Length": upstream.headers.get("content-length")!,
        ...(contentRange ? { "Content-Range": contentRange } : {}),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "Vary": "Authorization",
        "Cross-Origin-Resource-Policy": "same-site",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    await verifyObject(objectKey);
  } catch (error) {
    if (error instanceof Error && /verification failed \(404\)/.test(error.message)) {
      return errorResponse(404, "BRIDGE_ASSET_NOT_READY", "The requested media asset is not available in Bridge storage");
    }
    return errorResponse(503, "BRIDGE_ASSET_VERIFICATION_FAILED", "Bridge could not verify the media asset in storage");
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
      supabaseProjectRef: bridgeEnv.supabaseProjectRef(),
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
