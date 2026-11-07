export const BRIDGE_TESTING_SUPABASE_REF = "jbymleftneggcgutlcqu";

/**
 * Keep Razorpay unavailable in any runtime whose trust zone is not explicit.
 * Production keeps its existing credential path. Preview must be pinned to
 * Test Mode and the dedicated Testing Supabase project. Local/unknown runtimes
 * fail closed instead of inheriting Production credentials accidentally.
 */
export function assertRazorpayRuntimeIsolation(input: {
  vercelEnv?: string;
  keyId?: string;
  supabaseUrl?: string;
}) {
  if (input.vercelEnv === "production") return;

  if (input.vercelEnv !== "preview") {
    throw new Error("Razorpay is disabled for an unknown or non-production runtime");
  }

  if (!input.keyId?.startsWith("rzp_test_")) {
    throw new Error("Preview requires a Razorpay Test Mode key");
  }

  if (!input.supabaseUrl) {
    throw new Error("Preview requires the dedicated Testing Supabase URL");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.supabaseUrl);
  } catch {
    throw new Error("Preview Supabase URL is invalid");
  }

  const expectedHost = `${BRIDGE_TESTING_SUPABASE_REF}.supabase.co`;
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname.toLowerCase() !== expectedHost) {
    throw new Error("Preview is bound to an unapproved Supabase project");
  }
}
