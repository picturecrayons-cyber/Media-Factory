import { createClient } from "@supabase/supabase-js";
import { resolveCanonicalSupabaseUrl } from "./supabase-url.ts";
import { resolveTestAuthSupabaseUrl } from "./bridge/canonical.ts";

const testAuthEnabled = import.meta.env.VITE_TEST_AUTH_ENABLED === "true";
const testAuthUrl = import.meta.env.VITE_TEST_AUTH_SUPABASE_URL as string | undefined;
const testAuthPublishableKey = import.meta.env.VITE_TEST_AUTH_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const supabaseUrl = testAuthEnabled
  ? resolveTestAuthSupabaseUrl(true, testAuthUrl, testAuthPublishableKey)
  : resolveCanonicalSupabaseUrl(
      import.meta.env.VITE_SUPABASE_URL as string | undefined,
      import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined,
    );
const supabasePublishableKey = testAuthEnabled
  ? testAuthPublishableKey?.trim()
  : (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
    (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

if (!supabaseUrl) {
  throw new Error("CONFIG_MISSING: Supabase URL configuration is missing.");
}

if (!supabasePublishableKey) {
  throw new Error("CONFIG_MISSING: Supabase publishable key configuration is missing.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "crayons-bridge.sb-auth-token",
  },
});
