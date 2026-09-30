import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { retryWorkspaceSession } from "./workspace-session-retry.ts";

test("authenticated user with repeated workspace failures preserves the session", async () => {
  let refetches = 0;
  const input = {
    checkUser: async () => ({ data: { user: { id: "confirmed-user" } }, error: null }),
    refetch: async () => { refetches++; return { error: new Error("Database unavailable") }; },
    signIn: async () => { assert.fail("must preserve authenticated session"); },
  };
  assert.equal(await retryWorkspaceSession(input), "retried");
  assert.equal(await retryWorkspaceSession(input), "retried");
  assert.equal(refetches, 2);
});

for (const status of [403, 429, 500, 503]) {
  test(`auth service failure ${status} preserves local session`, async () => {
    assert.equal(await retryWorkspaceSession({
      checkUser: async () => ({ data: { user: null }, error: { status } }),
      refetch: async () => { assert.fail("must not query without verification"); },
      signIn: async () => { assert.fail("must not clear session on service failure"); },
    }), "unavailable");
  });
}

test("network failure preserves local session", async () => {
  assert.equal(await retryWorkspaceSession({
    checkUser: async () => { throw new Error("Network unavailable"); },
    refetch: async () => { assert.fail("must not refetch"); },
    signIn: async () => { assert.fail("must not sign out"); },
  }), "unavailable");
});

for (const error of [{ status: 401 }, { name: "AuthSessionMissingError" }]) {
  test(`explicit expired or missing authentication redirects once: ${JSON.stringify(error)}`, async () => {
    let redirects = 0;
    assert.equal(await retryWorkspaceSession({
      checkUser: async () => ({ data: { user: null }, error }),
      refetch: async () => { assert.fail("must not refetch"); },
      signIn: async () => { redirects++; },
    }), "expired");
    assert.equal(redirects, 1);
  });
}

test("onboarding retry uses verified user handling and preserves the production origin", () => {
  const source = readFileSync(new URL("../../routes/onboarding.tsx", import.meta.url), "utf8");
  assert.match(source, /retryWorkspaceSession\(/);
  assert.match(source, /checkUser: \(\) => supabase.auth.getUser\(\)/);
  assert.match(source, /disabled=\{retrying\}/);
  assert.match(source, /if \(retrying\) return/);
  assert.match(source, /to: "\/login", replace: true/);
  assert.doesNotMatch(source, /forceRefresh|localStorage.removeItem|bridge-kappa-six/);
});

test("verified user with a throwing profile retry does not sign out", async () => {
  await assert.rejects(() => retryWorkspaceSession({
    checkUser: async () => ({ data: { user: { id: "confirmed-user" } }, error: null }),
    refetch: async () => { throw new Error("Profile service unavailable"); },
    signIn: async () => { assert.fail("must preserve session"); },
  }), /Profile service unavailable/);
});
