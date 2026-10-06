import { z } from "zod";

export const destinationSchema = z.object({
  kind: z.enum(["OTT","APP","BUYER","BROADCASTER","STORE","DIGITAL_THEATRICAL"]),
  name: z.string().min(1).max(160),
});

export type Destination = z.infer<typeof destinationSchema>;
export type DetectedAsset = { key: string; ready: boolean; source: "legacy_asset" | "asset_version"; detail: string };
export type RequiredWork = { serviceCode: string; reason: string; quantity: number; destination?: string };

export function detectRequiredWork(input: {
  runtimeMinutes: number | null;
  destinations: Destination[];
  assets: Array<{ kind: string; ready: boolean; source: DetectedAsset["source"] }>;
  subtitleLanguages: string[];
  requestedDubbingLanguages: string[];
}) {
  const hasReady = (kind: string) => input.assets.some((a) => a.kind === kind && a.ready);
  const detectedAssets: DetectedAsset[] = input.assets.map((a) => ({
    key: a.kind,
    ready: a.ready,
    source: a.source,
    detail: a.ready ? "Ready evidence found" : "Asset exists but is not ready",
  }));
  const requiredWork: RequiredWork[] = [];
  if (!hasReady("master")) requiredWork.push({ serviceCode: "MASTER_VIDEO", reason: "No accepted video master is available.", quantity: 1 });
  if (!hasReady("audio")) requiredWork.push({ serviceCode: "MASTER_AUDIO", reason: "No accepted audio master is available.", quantity: 1 });
  if (!hasReady("poster")) requiredWork.push({ serviceCode: "PREP_CONTENT", reason: "Required artwork/preparation evidence is incomplete.", quantity: 1 });
  requiredWork.push({ serviceCode: "QC_TECHNICAL", reason: "Technical readiness must be independently verified before delivery.", quantity: 1 });
  for (const destination of input.destinations) {
    if (destination.kind === "OTT") {
      requiredWork.push({ serviceCode: "OTT_PACKAGE", reason: "Destination-ready OTT package.", quantity: 1, destination: destination.name });
      requiredWork.push({ serviceCode: "OTT_DELIVERY", reason: "Authorized OTT delivery.", quantity: 1, destination: destination.name });
    }
    if (destination.kind === "APP") {
      requiredWork.push({ serviceCode: "APP_PACKAGE", reason: "App-specific package.", quantity: 1, destination: destination.name });
      requiredWork.push({ serviceCode: "APP_DELIVERY", reason: "Authorized app delivery.", quantity: 1, destination: destination.name });
    }
    if (destination.kind === "BUYER") requiredWork.push({ serviceCode: "BUYER_DELIVERY", reason: "Secure buyer delivery.", quantity: 1, destination: destination.name });
    if (destination.kind === "BROADCASTER") requiredWork.push({ serviceCode: "BROADCAST_DELIVERY", reason: "Broadcaster delivery.", quantity: 1, destination: destination.name });
    if (destination.kind === "DIGITAL_THEATRICAL") requiredWork.push({ serviceCode: "DIGITAL_THEATRICAL_DELIVERY", reason: "Digital / theatrical package delivery.", quantity: 1, destination: destination.name });
    if (destination.kind === "STORE") {
      requiredWork.push({ serviceCode: "STORE_PACKAGE", reason: "Store-specific package.", quantity: 1, destination: destination.name });
      requiredWork.push({ serviceCode: "STORE_DELIVERY", reason: "Store delivery.", quantity: 1, destination: destination.name });
    }
  }
  const runtime = input.runtimeMinutes ?? 0;
  if (input.subtitleLanguages.length > 0 && runtime > 0 && !hasReady("subtitle")) {
    requiredWork.push({ serviceCode: "SUBTITLE_CREATE", reason: "Requested subtitle language is not supplied as an accepted asset.", quantity: runtime * input.subtitleLanguages.length });
  }
  if (input.requestedDubbingLanguages.length > 0 && runtime > 0) {
    requiredWork.push({ serviceCode: "DUBBING", reason: "Dubbing explicitly requested.", quantity: runtime * input.requestedDubbingLanguages.length });
  }
  return { detectedAssets, requiredWork };
}
