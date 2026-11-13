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
  const currentUser = read("src/lib/auth/use-current-user.ts");
  assert.match(auth, /sessionStorage\.setItem\("bridge\.signup-role-intent", accountType\)/);
  assert.match(currentUser, /sessionStorage\.getItem\("bridge\.signup-role-intent"\)/);
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


test("Story Concept submissions open by submission UUID and never route to a linked title", () => {
  const list = read("src/components/bridge/my-story-concepts.tsx");
  const detail = read("src/routes/story-concepts.$conceptId.tsx");
  const api = read("src/lib/bridge/story-concept-api.ts");
  const adminDesk = read("src/components/bridge/story-concept-desk.tsx");
  assert.match(list, /to="\/story-concepts\/\$conceptId"/);
  assert.match(adminDesk, /to="\/story-concepts\/\$conceptId"/);
  assert.match(detail, /getStoryConceptById\(\{ data: \{ conceptId \} \}\)/);
  assert.match(api, /where c\.id = \$\{data\.conceptId\}/);
  assert.match(api, /t\.owner_user_id = \$\{actor\.userId\}/);
  assert.doesNotMatch(list, /to="\/title\/\$id"/);
});

test("Story Concept intake persists against the existing required title_id schema", () => {
  const api = read("src/lib/bridge/story-concept-api.ts");
  const titles = read("src/lib/bridge/titles.ts");
  assert.match(api, /insert into bridge_titles[\s\S]*submission_type[\s\S]*'story_concept'/);
  assert.match(api, /insert into bridge_story_concept_submissions \([\s\S]*title_id/);
  assert.match(titles, /submission_type = 'finished_film'/);
});

test("Admin User Submissions maps Films and Story Concepts to their owner and status", () => {
  const admin = read("src/routes/admin.tsx");
  const api = read("src/lib/bridge/story-concept-api.ts");
  assert.match(admin, /User Submissions/);
  assert.match(admin, /listAdminStoryConcepts/);
  assert.match(admin, /Owner/);
  assert.match(admin, /Account \/ Studio/);
  assert.match(api, /left join bridge_profiles p on p\.user_id = t\.owner_user_id/);
});

test("Studio Members & Roles requires verified owner/admin and scopes audited membership changes", () => {
  const api = read("src/lib/bridge/studio-members.ts");
  const route = read("src/routes/studio.tsx");
  assert.match(api, /requireVerifiedActor/);
  assert.match(api, /actor\.accountType !== "studio"/);
  assert.match(api, /actor\.organizationId/);
  assert.match(api, /actor\.organizationRole/);
  assert.match(api, /owner.*admin/);
  assert.match(api, /m\.organization_id = \$\{actor\.organizationId\}/);
  assert.match(api, /join bridge_profiles p on p\.user_id = m\.user_id/);
  assert.match(api, /updateStudioMember/);
  assert.match(api, /membership_role = \$\{data\.membershipRole\}/);
  assert.match(api, /writeAudit/);
  assert.match(api, /current\.membership_role === "owner"/);
  assert.match(route, /StudioMemberDesk/);
});

test("Investor portfolio is read through authenticated server identity, not a client-supplied user id", () => {
  const api = read("src/lib/bridge/investor.ts");
  const route = read("src/routes/investor.tsx");
  assert.match(api, /\.middleware\(\[authMiddleware\]\)/);
  assert.match(api, /requireVerifiedActor\(context\.userId\)/);
  assert.match(api, /actor\.accountType !== "investor"/);
  assert.match(api, /where i\.investor_user_id = \$\{actor\.userId\}/);
  assert.doesNotMatch(route, /getSql|investorUserId/);
});
