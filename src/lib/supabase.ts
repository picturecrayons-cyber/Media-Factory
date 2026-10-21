import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl) {
  throw new Error("[Crayons Bridge] Supabase URL configuration is missing.");
}

if (!supabasePublishableKey) {
  throw new Error("[Crayons Bridge] Supabase publishable key configuration is missing.");
}

/**
 * Browser sessions are stored in Supabase SSR cookies so TanStack Start can
 * verify authentication before rendering protected routes. Do not use a
 * service-role or secret key in this client.
 */
export const supabase = createBrowserClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
