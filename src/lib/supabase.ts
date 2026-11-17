import { createClient } from "@supabase/supabase-js";
import { resolveCanonicalSupabaseUrl } from "./supabase-url.ts";
import { resolveBridgeSupabaseUrl } from "./bridge/canonical.ts";

const configuredSupabaseUrl = resolveCanonicalSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined,
);
const supabaseUrl = resolveBridgeSupabaseUrl({
  VERCEL_ENV: import.meta.env.VITE_VERCEL_ENV,
  BRIDGE_DATABASE_TARGET: import.meta.env.VITE_BRIDGE_DATABASE_TARGET,
  SUPABASE_URL: configuredSupabaseUrl,
});
const supabasePublishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
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
