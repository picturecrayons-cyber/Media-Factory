/**
 * Catalog publish contract. Separate from B2B master handoff in loop-handoff.ts.
 * Loop must never receive master_key as a playback_path.
 */

export const LOOP_PUBLISH_EVENTS = [
  "TITLE_PUBLISHED_TO_LOOP",
  "TITLE_UNPUBLISHED",
  "RIGHTS_EXPIRING",
  "RIGHTS_EXPIRED",
] as const;
export type LoopPublishEvent = (typeof LOOP_PUBLISH_EVENTS)[number];

export const MONETIZATION_MODES = ["free", "svod", "tvod", "premiere"] as const;
export type MonetizationMode = (typeof MONETIZATION_MODES)[number];

export type LoopPublishPayload = {
  source: "crayons-bridge";
  event: LoopPublishEvent;
  bridge_title_id: string;
  loop_title_id: string | null;
  title: string;
  synopsis: string;
  content_type: string;
  year: number | null;
  languages: string[];
  artwork: string | null;
  trailer: string | null;
  genres: string[];
  cast_credits: string;
  maturity_rating: string;
  availability_territory: string;
  rights_start: string | null;
  rights_end: string | null;
  monetization_mode: MonetizationMode;
  price_plan_eligibility: string;
  playback_asset_reference: string;
  publishing_status: "published" | "unpublished";
};

export type LoopPublishGateInput = {
  titleExists: boolean;
  qcPassed: boolean;
  rightsApproved: boolean;
  rightsEvidenced: boolean;
  territoryAllowed: boolean;
  windowActive: boolean;
  publishingPermission: boolean;
  playbackKey: string | null;
  masterKey: string | null;
  playbackMime: string | null;
};

const PLAYBACK_MIME = new Set([
  "video/mp4",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
]);

export function playbackAssetIsReady(input: {
  playbackKey: string | null;
  masterKey: string | null;
  playbackMime: string | null;
}): boolean {
  const key = input.playbackKey?.trim() ?? "";
  if (!key) return false;
  if (input.masterKey && key === input.masterKey) return false;
  const lower = key.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".mov") || lower.endsWith(".mxf") || lower.endsWith(".mkv")) return false;
  if (lower.startsWith("/media/") || lower.startsWith("media/")) return false;
  const mime = (input.playbackMime ?? "").toLowerCase();
  if (mime && !PLAYBACK_MIME.has(mime)) return false;
  if (!mime && !(lower.endsWith(".mp4") || lower.endsWith(".m3u8"))) return false;
  return true;
}

export function assertLoopPublishGates(input: LoopPublishGateInput): void {
  if (!input.titleExists) throw new Error("Title does not exist");
  if (!input.qcPassed) throw new Error("QC not approved");
  if (!input.rightsApproved || !input.rightsEvidenced) throw new Error("Distribution rights invalid");
  if (!input.territoryAllowed) throw new Error("Territory not allowed");
  if (!input.windowActive) throw new Error("License window inactive");
  if (!input.publishingPermission) throw new Error("Publishing permission not granted");
  if (
    !playbackAssetIsReady({
      playbackKey: input.playbackKey,
      masterKey: input.masterKey,
      playbackMime: input.playbackMime,
    })
  ) {
    throw new Error("Streaming asset not READY");
  }
}

export function buildLoopPublishPayload(
  fields: Omit<LoopPublishPayload, "source" | "event" | "publishing_status"> & {
    event?: LoopPublishEvent;
    publishing_status?: "published" | "unpublished";
  },
): LoopPublishPayload {
  if (!fields.bridge_title_id.trim()) throw new Error("bridge_title_id required");
  if (!fields.title.trim()) throw new Error("title required");
  if (fields.playback_asset_reference === fields.artwork) {
    throw new Error("playback_asset_reference must be a derived playback object, not artwork");
  }
  return {
    source: "crayons-bridge",
    event: fields.event ?? "TITLE_PUBLISHED_TO_LOOP",
    publishing_status: fields.publishing_status ?? "published",
    bridge_title_id: fields.bridge_title_id,
    loop_title_id: fields.loop_title_id,
    title: fields.title,
    synopsis: fields.synopsis,
    content_type: fields.content_type || "Film",
    year: fields.year,
    languages: fields.languages,
    artwork: fields.artwork,
    trailer: fields.trailer,
    genres: fields.genres,
    cast_credits: fields.cast_credits,
    maturity_rating: fields.maturity_rating || "U",
    availability_territory: fields.availability_territory,
    rights_start: fields.rights_start,
    rights_end: fields.rights_end,
    monetization_mode: fields.monetization_mode,
    price_plan_eligibility: fields.price_plan_eligibility,
    playback_asset_reference: fields.playback_asset_reference,
  };
}

export function loopPublishBody(payload: LoopPublishPayload): string {
  return JSON.stringify(payload);
}

export function payloadExposesMaster(payload: LoopPublishPayload, masterKey: string | null): boolean {
  if (!masterKey) return false;
  return (
    payload.playback_asset_reference === masterKey ||
    payload.artwork === masterKey ||
    payload.trailer === masterKey
  );
}
