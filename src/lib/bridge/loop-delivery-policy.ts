import { createHash } from "node:crypto";

export type ManualLoopModel = "TVOD" | "AVOD";
export type ManualDeliveryStatus = "PREPARED" | "DELIVERED" | "APPROVED" | "REJECTED" | "PUBLISHED";

// jsonb may reorder object keys. Never hash incidental driver/property ordering.
export function canonicalDeliveryJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalDeliveryJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalDeliveryJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export function deliveryHash(value: unknown): string {
  return createHash("sha256").update(canonicalDeliveryJson(value)).digest("hex");
}
export function assertDeliveryReview(
  status: string,
  preparedBy: string,
  deliveredBy: string | null,
  reviewer: string,
) {
  if (status !== "DELIVERED") throw new Error("Record manual delivery before reviewing this package");
  if (reviewer === preparedBy || reviewer === deliveredBy)
    throw new Error("Another authorized operator must record Loop acceptance or rejection");
}
export function assertDeliveryUnchanged(recordedHash: string, currentHash: string) {
  if (recordedHash !== currentHash)
    throw new Error("Title, assets or license changed. Prepare and deliver a new package for approval");
}
export function assertManualModelCanPublish(model: string) {
  // AVOD is not FREE. Never silently bypass ad/consent enforcement with a FREE entitlement.
  if (model !== "TVOD")
    throw new Error("AVOD delivery and approval can be recorded, but publishing is blocked until Loop ad-supported playback is implemented and verified");
}
