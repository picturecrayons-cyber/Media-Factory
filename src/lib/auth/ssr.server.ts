import { createServerClient } from "@supabase/ssr";
import { createServerFn } from "@tanstack/react-start";
import { getCookies, setCookie } from "@tanstack/react-start/server";

function getSupabaseConfig() {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) throw new Error("Supabase staging/runtime configuration is missing.");
  return { url, key };
}

/** Create a request-scoped client; never cache a user's cookie-bound client globally. */
function createRequestSupabaseClient() {
  const { url, key } = getSupabaseConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(name, value, {
            ...options,
            path: options.path ?? "/",
            sameSite: options.sameSite ?? "lax",
            secure: process.env.NODE_ENV === "production",
          });
        }
      },
    },
  });
}

/**
 * Server-verified session check used by the root route beforeLoad guard.
 * getUser() validates the cookie session against Supabase Auth; getSession()
 * alone would only read untrusted cookie contents.
 */
export const getCookieAuthStatus = createServerFn({ method: "GET" }).handler(async () => {
  const client = createRequestSupabaseClient();
  const { data, error } = await client.auth.getUser();
  return { authenticated: !error && Boolean(data.user) };
});
