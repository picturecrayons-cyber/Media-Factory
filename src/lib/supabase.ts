import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl) {
  throw new Error("[Crayons Bridge] Supabase URL configuration is missing.");
}

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
