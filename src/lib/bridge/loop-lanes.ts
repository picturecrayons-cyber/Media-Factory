/** Private CMS formats. Loop only receives a lane after Bridge delivers the title as TVOD. */
export const BRIDGE_LOOP_LANES = [
  { id: "FILM", label: "Films", loopType: "Film" },
  { id: "SERIES", label: "Series", loopType: "Series" },
  { id: "VERTICAL", label: "Vertical drama", loopType: "Vertical drama" },
  { id: "SHORT", label: "Shorts", loopType: "Short" },
] as const;

export type BridgeLoopLane = (typeof BRIDGE_LOOP_LANES)[number]["loopType"];

export function loopStageType(raw: string | null | undefined): BridgeLoopLane {
  const value = (raw || "").toLowerCase();
  if (value.includes("vertical") || value.includes("9:16") || value.includes("9x16")) return "Vertical drama";
  if (value.includes("series") || value.includes("episode") || value.includes("season")) return "Series";
  if (value.includes("short")) return "Short";
  return "Film";
}
