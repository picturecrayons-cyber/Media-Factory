import type { TitleStatus } from "./types.ts";

export const STUDIO_PIPELINE = [
  { id: "draft", label: "Draft", statuses: ["DRAFT", "UPLOADING", "PREPARING"] as const },
  { id: "review", label: "Review", statuses: ["QC_REVIEW"] as const },
  { id: "verified", label: "Verified", statuses: ["RIGHTS_REVIEW", "LICENSING_READY"] as const },
  { id: "matched", label: "Matched", statuses: ["LIVE_FOR_BUYERS"] as const },
  { id: "negotiation", label: "Negotiation", statuses: ["IN_NEGOTIATION"] as const },
  { id: "licensed", label: "Licensed", statuses: ["LICENSED"] as const },
  { id: "delivered", label: "Delivered", statuses: ["DELIVERED"] as const },
] as const;

export function countPipeline(titles: { status: TitleStatus }[]) {
  return STUDIO_PIPELINE.map((col) => ({
    id: col.id,
    label: col.label,
    count: titles.filter((t) => (col.statuses as readonly string[]).includes(t.status)).length,
  }));
}

export function formatInrPaise(paise: number): string | null {
  if (!Number.isFinite(paise) || paise <= 0) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export const DEAL_STATUSES = [
  "opportunity",
  "proposal",
  "negotiation",
  "terms_agreed",
  "contract",
  "payment",
  "rights_activated",
  "delivery",
  "settlement",
  "closed",
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];
