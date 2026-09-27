import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://mlmgugivsyoxzdgwkbpu.supabase.co";

const supabasePublishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  "sb_publishable_8XCMcaqHvYMWANqxqnS0mw_f_asubxB";

if (!supabaseUrl || !supabasePublishableKey) {
  console.error("[Crayons Bridge] Supabase configuration is missing");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "crayons-bridge.sb-auth-token",
  },
});
