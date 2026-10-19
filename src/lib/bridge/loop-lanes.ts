/** Private CMS formats. Loop only receives a lane after Bridge delivers the title as TVOD. */
export const BRIDGE_LOOP_LANES = [
  { id: "FILM", label: "Films", loopType: "Film" },
  { id: "SERIES", label: "Series", loopType: "Series" },
  { id: "VERTICAL", label: "Vertical drama", loopType: "Vertical drama" },
  { id: "SHORT", label: "Shorts", loopType: "Short" },
] as const;

export type BridgeLoopLane = (typeof BRIDGE_LOOP_LANES)[number]["loopType"];
export type BridgeContentLane = BridgeLoopLane | "Unclassified";

export function loopStageType(raw: string | null | undefined): BridgeContentLane {
  const value = (raw || "").toLowerCase();
  if (value.includes("vertical") || value.includes("9:16") || value.includes("9x16")) return "Vertical drama";
  if (value.includes("series") || value.includes("episode") || value.includes("season")) return "Series";
  if (value.includes("short")) return "Short";
  if (value.includes("film") || value.includes("feature") || value.includes("movie")) return "Film";
  return "Unclassified";
}

export function isActiveLoopPublication(input: {
  authorizationStatus: string | null | undefined;
  listed: boolean;
  published: boolean;
  windowStart?: string | Date | null;
  windowEnd?: string | Date | null;
}, now: Date = new Date()): boolean {
  const status = (input.authorizationStatus || "").toUpperCase();
  if (!(status === "AUTHORIZED" || status === "LIVE") || !input.listed || !input.published) return false;
  const start = input.windowStart ? new Date(input.windowStart).getTime() : Number.NaN;
  const end = input.windowEnd ? new Date(input.windowEnd).getTime() : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const current = now.getTime();
  return start <= current && current < end;
}
