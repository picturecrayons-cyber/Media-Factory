import { bridgeCallbackUrl, isApprovedBridgeOrigin, normalizeBridgeOrigin } from "../bridge/origin.ts";

export function resolveAuthCallbackUrl(options: {
  testAuthEnabled: boolean;
  runtimeOrigin?: string;
}): string {
  if (!options.testAuthEnabled) {
    return bridgeCallbackUrl(undefined);
  }

  const origin = normalizeBridgeOrigin(options.runtimeOrigin);
  const hostname = origin ? new URL(origin).hostname.toLowerCase() : "";
  if (
    !origin ||
    !isApprovedBridgeOrigin(origin) ||
    !hostname.startsWith("bridge-") ||
    !hostname.endsWith(".vercel.app")
  ) {
    throw new Error("Test Auth callback must use the approved Crayons Bridge Preview origin.");
  }

  return bridgeCallbackUrl(origin);
}
