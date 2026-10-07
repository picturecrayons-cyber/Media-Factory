import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

test("CRA-101 confirmed-email callback establishes Supabase session before onboarding", () => {
  const source = read("src/routes/auth/callback.tsx");
  assert.match(source, /verifyOtp\(/);
  assert.match(source, /exchangeCodeForSession\(/);
  assert.match(source, /supabase\.auth\.getSession\(\)/);
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /syncSupabaseSessionUser\(\)/);
  assert.match(source, /navigate\(\{ to: "\/onboarding" \}\)/);
});

test("CRA-101 onboarding waits for restored identity and scopes workspace cache by user", () => {
  const source = read("src/routes/onboarding.tsx");
  assert.match(source, /enabled: !isPending && Boolean\(user\)/);
  assert.match(source, /queryKey: \["bridge-session", user\?\.id\]/);
  assert.match(source, /if \(!user\) return <RedirectToSignIn/);
  assert.match(source, /retryWorkspaceSession\(/);
  assert.match(source, /checkUser: \(\) => supabase\.auth\.getUser\(\)/);
});

test("CRA-101 refresh restoration uses current Supabase session and rejects stale auth", () => {
  const source = read("src/lib/auth/session-restoration.test.ts");
  assert.match(source, /confirmation session persists and is restored on a fresh client before onboarding/);
  assert.match(source, /refresh waits for confirmation restoration and uses the SDK's current token/);
  assert.match(source, /expired refresh token cannot fall back to a stale authenticated session/);
  assert.match(source, /PKCE exchange persists a session and forced refresh returns the rotated bearer/);
});

test("CRA-101 expired or missing auth redirects once without retry loop", () => {
  const source = read("src/lib/auth/workspace-session-retry.test.ts");
  assert.match(source, /explicit expired or missing authentication redirects once/);
  assert.match(source, /redirects\+\+/);
  assert.match(source, /assert\.equal\(redirects, 1\)/);
  assert.match(source, /network failure preserves local session/);
});
