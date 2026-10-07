import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient, type Session } from "@supabase/supabase-js";
import { restoreSupabaseSession } from "./session-restoration.ts";

const confirmedSession = {
  access_token: "confirmed-access-token",
  refresh_token: "confirmed-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "confirmed-user", email_confirmed_at: "2026-09-30T00:00:00Z" },
} as Session;
const result = (session: Session | null, error: unknown = null) => ({ data: { session }, error });

test("confirmation session persists and is restored on a fresh client before onboarding", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const options = {
    auth: {
      storage,
      storageKey: "test-confirmation",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async () =>
        new Response(JSON.stringify(confirmedSession), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    },
  };
  const callback = createClient("https://auth.example.test", "test-publishable-key", options);
  const verified = await callback.auth.verifyOtp({
    token_hash: "test-confirmation-hash",
    type: "signup",
  });
  assert.equal(verified.error, null);
  assert.equal((await restoreSupabaseSession(callback.auth))?.user.id, "confirmed-user");
  const reloaded = createClient("https://auth.example.test", "test-publishable-key", options);
  assert.equal(
    (await restoreSupabaseSession(reloaded.auth))?.access_token,
    "confirmed-access-token",
  );
});

test("refresh waits for confirmation restoration and uses the SDK's current token", async () => {
  let release!: (value: ReturnType<typeof result>) => void;
  let refreshes = 0;
  const restored = new Promise<ReturnType<typeof result>>((resolve) => {
    release = resolve;
  });
  const pending = restoreSupabaseSession(
    {
      getSession: () => restored,
      refreshSession: async () => {
        refreshes++;
        return result({ ...confirmedSession, access_token: "rotated-token" });
      },
    },
    { forceRefresh: true },
  );
  await Promise.resolve();
  assert.equal(refreshes, 0);
  release(result(confirmedSession));
  assert.equal((await pending)?.access_token, "rotated-token");
  assert.equal(refreshes, 1);
});

for (const session of [null, { ...confirmedSession, refresh_token: "" }]) {
  test(`missing ${session ? "refresh token" : "session"} never attempts forced refresh`, async () => {
    const restored = await restoreSupabaseSession(
      {
        getSession: async () => result(session),
        refreshSession: async () => {
          assert.fail("must not refresh without a restored token");
        },
      },
      { forceRefresh: true },
    );
    assert.equal(restored, null);
  });
}

test("expired refresh token cannot fall back to a stale authenticated session", async () => {
  const restored = await restoreSupabaseSession(
    {
      getSession: async () => result(confirmedSession),
      refreshSession: async () => result(null, new Error("Invalid Refresh Token")),
    },
    { forceRefresh: true },
  );
  assert.equal(restored, null);
});

test("onboarding and workspace wait for restoration and scope cached profiles to identity", () => {
  for (const path of ["../../routes/onboarding.tsx", "../../components/bridge/gate.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /enabled: !isPending && Boolean\(user\)/);
    assert.match(source, /queryKey: \["bridge-session", user\?\.id\]/);
    assert.match(source, /if \(!user\) return <RedirectToSignIn/);
  }
  const hook = readFileSync(new URL("./use-current-user.ts", import.meta.url), "utf8");
  assert.doesNotMatch(hook, /user: normalize\(getStoredSupabaseUser\(\)\)/);
  assert.match(hook, /alive && !authChanged/);
});

test("PKCE exchange persists a session and forced refresh returns the rotated bearer", async () => {
  const values = new Map<string, string>([["test-pkce-code-verifier", JSON.stringify("local-test-verifier")]]);
  const requests: string[] = [];
  const client = createClient("https://auth.example.test", "test-publishable-key", {
    auth: {
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
        removeItem: (key) => {
          values.delete(key);
        },
      },
      storageKey: "test-pkce",
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (url) => {
        requests.push(String(url));
        return new Response(
          JSON.stringify({
            ...confirmedSession,
            access_token: String(url).includes("refresh_token")
              ? "refreshed-access-token"
              : "exchanged-access-token",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  });
  const exchanged = await client.auth.exchangeCodeForSession("local-confirmation-code");
  assert.equal(exchanged.error, null);
  assert.equal((await restoreSupabaseSession(client.auth))?.access_token, "exchanged-access-token");
  assert.equal(
    (await restoreSupabaseSession(client.auth, { forceRefresh: true }))?.access_token,
    "refreshed-access-token",
  );
  assert.equal(requests.length, 2);
  assert.match(requests[0], /grant_type=pkce/);
  assert.match(requests[1], /grant_type=refresh_token/);
});
