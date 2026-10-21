import { createServerFn } from "@tanstack/react-start";

/**
 * Server-verified session check used by the root route beforeLoad guard.
 * The imports stay inside the server handler so no server-only module enters
 * the client bundle. getUser() validates cookie contents against Supabase Auth.
 */
export const getCookieAuthStatus = createServerFn({ method: "POST" }).handler(async () => {
  const [{ createServerClient }, { getCookies, setCookie }] = await Promise.all([
    import("@supabase/ssr"),
    import("@tanstack/react-start/server"),
  ]);

  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) throw new Error("Supabase staging/runtime configuration is missing.");

  const client = createServerClient(url, key, {
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

  const { data, error } = await client.auth.getUser();
  return { authenticated: !error && Boolean(data.user) };
});
