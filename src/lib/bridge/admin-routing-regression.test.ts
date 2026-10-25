import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("missing Bridge profiles fall back to onboarding without granting access", () => {
  const session = read("./session.ts");
  assert.match(session, /if \(!actor\)\s*\{\s*return \{ userId: context\.userId, profile: null, home: "\/onboarding" \};/);
  assert.match(session, /if \(!actor\) throw new Error\("Profile required"\)/);
});

test("authenticated profiles route through the server-resolved workspace home", () => {
  const session = read("./session.ts");
  const onboarding = read("../../routes/onboarding.tsx");
  assert.match(session, /profile: actor, home: workspaceHome\(actor\)/);
  assert.match(onboarding, /const home = sessionQ\.data\?\.profile \? sessionQ\.data\.home : null/);
  assert.match(onboarding, /if \(home\) goHome\(home, navigate\)/);
});

test("dashboard access is enforced server-side for verified super admins", () => {
  const session = read("./session.ts");
  const rbac = read("./rbac.ts");
  assert.match(session, /const actor = await requireVerifiedActor\(context\.userId\)/);
  assert.match(session, /if \(!canAccessDashboard\(actor\)\) throw new Error\("Super admin access required"\)/);
  assert.match(rbac, /return actor\.emailVerified && actor\.internalRole === "super_admin"/);
});

test("public onboarding does not silently treat a missing profile as an admin session", () => {
  const onboarding = read("../../routes/onboarding.tsx");
  assert.match(onboarding, /if \(!user\) return <RedirectToSignIn \/>/);
  assert.match(onboarding, /if \(home\) goHome\(home, navigate\)/);
  assert.doesNotMatch(onboarding, /internal_role\s*=\s*["']super_admin["']/);
});

test("authenticated missing-profile sessions render explicit recovery instead of public onboarding", () => {
  const onboarding = read("../../routes/onboarding.tsx");
  assert.match(onboarding, /const SESSION_TIMEOUT_MS = 8_000/);
  assert.match(onboarding, /sessionQ\.data && sessionQ\.data\.profile === null/);
  assert.match(onboarding, /We couldn't find your Bridge profile/);
  assert.match(onboarding, /Contact Support/);
  assert.match(onboarding, /Try Different Account/);
  assert.match(onboarding, /retryProfileResolution/);
  assert.match(onboarding, /No profile or role has been created/);
  assert.match(onboarding, /Access is granted only after your identity link is verified/);
});
