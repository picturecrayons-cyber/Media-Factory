export const CERTIFICATION_VERSION = "bridge-rights-v1";

export const CERTIFICATION_TEXT =
  "I certify that I am the authorized copyright owner or authorized distributor of this film, and that I have the authority to submit it for review and commercial consideration.";

export const COMMERCIAL_PREFERENCE_IDS = [
  "svod",
  "tvod",
  "hybrid",
  "licensing",
  "regional",
  "international",
  "broadcast",
  "fast",
  "avod",
  "other",
] as const;

export type CommercialPreferenceId = (typeof COMMERCIAL_PREFERENCE_IDS)[number];

export const COMMERCIAL_PREFERENCE_LABELS: Record<CommercialPreferenceId, string> = {
  svod: "SVOD",
  tvod: "TVOD",
  hybrid: "Hybrid window",
  licensing: "Licensing",
  regional: "Regional distribution",
  international: "International distribution",
  broadcast: "Broadcast",
  fast: "FAST",
  avod: "AVOD",
  other: "Other rights",
};

export function classifyScreenerUrl(raw: string): { status: "pending" | "failed"; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { status: "failed", reason: "Invalid URL" };
  }
  if (url.protocol !== "https:") {
    return { status: "failed", reason: "Screener must be https" };
  }
  const path = url.pathname.toLowerCase();
  const looksMedia =
    path.endsWith(".m3u8") ||
    path.endsWith(".mp4") ||
    path.endsWith(".mov") ||
    /hls|stream|screener|video/i.test(path + url.search);
  if (!looksMedia) {
    return { status: "pending", reason: "URL accepted; media type not verified" };
  }
  return { status: "pending", reason: "Media verification pending" };
}
