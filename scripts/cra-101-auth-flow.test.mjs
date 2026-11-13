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

test("CRA-101 callback ignores caller-controlled next and routes from the verified Bridge profile", () => {
  const source = read("src/routes/auth/callback.tsx");
  assert.ok(source.includes('navigate({ to: syncResult.home || "/onboarding" })'));
  assert.doesNotMatch(source, /sanitizeNextPath|safeNext/);
});

test("CRA-101 Google signup preserves the selected public account intent through OAuth", () => {
  const auth = read("src/lib/auth/client.ts");
  const signup = read("src/routes/signup.tsx");
  const onboarding = read("src/routes/onboarding.tsx");
  assert.match(auth, /sessionStorage\.setItem\("bridge\.signup-role-intent", accountType\)/);
  assert.match(auth, /provider: "google"/);
  assert.match(auth, /scopes: "email profile"/);
  assert.match(signup, /signInWithGoogle\(accountType\)/);
  assert.match(onboarding, /sessionStorage\.getItem\("bridge\.signup-role-intent"\)/);
  for (const role of ["independent_creator", "studio", "buyer", "investor"]) {
    assert.ok(signup.includes(`id: "${role}"`));
  }
});

test("CRA-101 homepage exposes all four direct role-specific signup CTAs", () => {
  const source = read("src/routes/index.tsx");
  for (const role of ["creator", "studio", "buyer", "investor"]) {
    assert.ok(source.includes(`role: "${role}"`));
  }
  assert.match(source, /id="account-pathways"/);
});

test("CRA-101 welcome email links to the selected role workspace and escapes the display name", () => {
  const source = read("src/lib/bridge/mail.server.ts");
  for (const route of ["/creator", "/studio", "/buyer", "/investor"]) {
    assert.ok(source.includes(route));
  }
  assert.match(source, /replaceAll\("&", "&amp;"\)/);
  assert.match(source, /category: "welcome"/);
});

test("CRA-101 Creator and Studio intake is validated before account completion", () => {
  const source = read("src/routes/onboarding.tsx");
  assert.ok(source.indexOf("if (!titleName.trim())") < source.indexOf("await completeOnboarding("));
});
