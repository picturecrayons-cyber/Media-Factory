import type { TitleStatus } from "./types.ts";

const FORWARD: Record<TitleStatus, TitleStatus | null> = {
  DRAFT: "UPLOADING",
  UPLOADING: "PREPARING",
  PREPARING: "QC_REVIEW",
  QC_REVIEW: "RIGHTS_REVIEW",
  RIGHTS_REVIEW: "LICENSING_READY",
  LICENSING_READY: "LIVE_FOR_BUYERS",
  LIVE_FOR_BUYERS: "IN_NEGOTIATION",
  IN_NEGOTIATION: "LICENSED",
  LICENSED: "DELIVERED",
  DELIVERED: null,
};

export const TITLE_STATUS_ORDER: TitleStatus[] = [
  "DRAFT",
  "UPLOADING",
  "PREPARING",
  "QC_REVIEW",
  "RIGHTS_REVIEW",
  "LICENSING_READY",
  "LIVE_FOR_BUYERS",
  "IN_NEGOTIATION",
  "LICENSED",
  "DELIVERED",
];

export function nextStatus(current: TitleStatus): TitleStatus | null {
  return FORWARD[current];
}

export function canTransition(from: TitleStatus, to: TitleStatus): boolean {
  return FORWARD[from] === to;
}

export function assertTransition(from: TitleStatus, to: TitleStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal title transition ${from} → ${to}`);
  }
}

export function isBuyerVisible(status: TitleStatus): boolean {
  return (
    status === "LIVE_FOR_BUYERS" ||
    status === "IN_NEGOTIATION" ||
    status === "LICENSED" ||
    status === "DELIVERED"
  );
}
