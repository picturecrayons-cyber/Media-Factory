import { createClient } from "@supabase/supabase-js";
import { resolveCanonicalSupabaseUrl } from "./supabase-url.ts";
import { resolveConsistentAlias } from "./bridge/config-safety.ts";

const supabaseUrl = resolveCanonicalSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined,
);
const supabasePublishableKey = resolveConsistentAlias(
  "Supabase publishable key",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined,
);

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
