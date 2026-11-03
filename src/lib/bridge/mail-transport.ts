export type BridgeMailTransport = "smtp" | "sink";

/**
 * Resolve mail delivery from trusted runtime environment markers only.
 * Preview, local development and tests always use a memory-backed stream sink.
 * SMTP is enabled only for an actual Vercel Production runtime.
 */
export function resolveBridgeMailTransport(
  env: Record<string, string | undefined>,
): BridgeMailTransport {
  if (env.NODE_ENV === "test") return "sink";

  const vercelEnv = env.VERCEL_ENV?.trim();
  if (vercelEnv === "preview" || vercelEnv === "development") return "sink";
  if (vercelEnv === "production" && env.NODE_ENV === "production") return "smtp";
  if (!vercelEnv && env.NODE_ENV === "development") return "sink";

  throw new Error("Transactional email is disabled for an unknown or mismatched runtime environment");
}
