import { createClient } from "@supabase/supabase-js";
import { resolveConfiguredSupabaseUrl } from "./bridge/canonical.ts";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const deployEnvironment = import.meta.env.VITE_BRIDGE_DEPLOY_ENV as string | undefined;
const expectedSupabaseRef = import.meta.env.VITE_BRIDGE_EXPECTED_SUPABASE_REF as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!rawSupabaseUrl) {
  throw new Error("[Crayons Bridge] Supabase URL configuration is missing.");
}

const supabaseUrl = resolveConfiguredSupabaseUrl(
  rawSupabaseUrl,
  deployEnvironment,
  expectedSupabaseRef,
);

if (!supabasePublishableKey) {
  throw new Error("[Crayons Bridge] Supabase publishable key configuration is missing.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "crayons-bridge.sb-auth-token",
  },
});
