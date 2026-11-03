export const BRIDGE_TESTING_SUPABASE_REF = "jbymleftneggcgutlcqu";

export function assertRazorpayRuntimeIsolation(input: {
  vercelEnv?: string;
  keyId?: string;
  supabaseUrl?: string;
}) {
  if (input.vercelEnv !== "preview") return;

  if (!input.keyId?.startsWith("rzp_test_")) {
    throw new Error("Preview requires a Razorpay Test Mode key");
  }

  if (!input.supabaseUrl) {
    throw new Error("Preview requires the dedicated Testing Supabase URL");
  }

  let hostname: string;
  try {
    hostname = new URL(input.supabaseUrl).hostname.toLowerCase();
  } catch {
    throw new Error("Preview Supabase URL is invalid");
  }

  const expectedHost = `${BRIDGE_TESTING_SUPABASE_REF}.supabase.co`;
  if (hostname !== expectedHost) {
    throw new Error("Preview is bound to an unapproved Supabase project");
  }
}
