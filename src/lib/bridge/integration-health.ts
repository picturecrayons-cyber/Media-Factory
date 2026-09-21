export type IntegrationLabel = "connected" | "configured" | "not_configured" | "error";

/** Env presence is never enough for CONNECTED. */
export function integrationLabel(opts: { bound: boolean; probedOk?: boolean | null }): IntegrationLabel {
  if (!opts.bound) return "not_configured";
  if (opts.probedOk === true) return "connected";
  if (opts.probedOk === false) return "error";
  return "configured";
}

export const UNCONFIGURED_PROVIDERS = ["whatsapp", "youtube", "cloudfront"] as const;
