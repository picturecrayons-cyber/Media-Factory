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
  assert.match(session, /if \(!canAccessDashboard\(actor\)\) throw new Error\("Super admin access required"\)/);
  assert.match(rbac, /return actor\.emailVerified && actor\.internalRole === "super_admin"/);
});

test("public onboarding does not silently treat a missing profile as an admin session", () => {
  const onboarding = read("../../routes/onboarding.tsx");
  assert.match(onboarding, /if \(!user\) return <RedirectToSignIn \/>/);
  assert.match(onboarding, /if \(home\) goHome\(home, navigate\)/);
  assert.doesNotMatch(onboarding, /internal_role\s*=\s*["']super_admin["']/);
});

test("public signup role selector is accessible and limited to supported public roles", () => {
  const signup = read("../../routes/signup.tsx");
  assert.match(signup, /role="radiogroup"/);
  assert.match(signup, /type="radio"/);
  assert.match(signup, /publicAccountTypeFrom\(search\.role\)/);
  assert.match(signup, /Investor access/);
});

test("onboarding preserves the signup-selected role and fails closed for unsupported roles", () => {
  const onboarding = read("../../routes/onboarding.tsx");
  assert.match(onboarding, /publicAccountTypeFrom\(signupAccountTypeHint\)/);
  assert.match(read("../../lib/auth/use-current-user.ts"), /signupAccountTypeHint/);
  assert.match(onboarding, /if \(signupAccountType\) setAccountType\(signupAccountType\)/);
  assert.match(onboarding, /if \(unsupportedSignupRole\)/);
});

test("the server rejects direct Investor onboarding without a reviewed access path", () => {
  const profiles = read("./profiles.ts");
  assert.match(profiles, /data\.accountType === "investor"[\s\S]{0,120}Investor access requires a reviewed access request/);
});

test("investor CTA requests reviewed access instead of silently signing up as Creator", () => {
  const home = read("../../routes/index.tsx");
  assert.match(home, /to="\/contact"/);
  assert.match(home, /Request Investor Access/);
  assert.doesNotMatch(home, /search=\{\{ role: "investor" \}\}/);
});

test("shared title workspace has an explicit role gate and Studio list scope", () => {
  const workspace = read("../../routes/workspace.tsx");
  const gate = read("../../components/bridge/gate.tsx");
  const titles = read("./titles.ts");
  const rbac = read("./rbac.ts");
  assert.match(workspace, /<RequireBridge allow="workspace">/);
  assert.match(gate, /allow === "workspace" && !canAccessTitleWorkspace\(profile\)/);
  assert.match(rbac, /export function canAccessTitleWorkspace\(actor: Actor\)/);
  assert.match(titles, /bridge_organization_memberships/);
  assert.match(titles, /owner_organization_id = \$\{orgId\}/);
  assert.doesNotMatch(titles, /lower\(trim\(organization_name\)\)/);
  const assets = read("./assets.ts");
  const workflow = read("./workflow.ts");
  assert.match(assets, /canOperateOnTitle\(actor, title, "asset.sign_upload", "asset.sign_upload"\)/);
  assert.match(workflow, /owner_organization_id/);
  assert.match(workflow, /canOperateOnTitle\(/);
  assert.match(titles, /canReadTitle\(actor, title\)/);
  assert.match(titles, /canMutateTitle\(actor, title, "title.update_own", "title.license"\)/);
  const migration = read("../../../migrations/0021_bridge_organizations.sql");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all privileges on table bridge_organization_memberships from (?:public,\s*)?anon, authenticated/i);
  const profiles = read("./profiles.ts");
  assert.match(profiles, /insert into bridge_organization_memberships/);
});

test("Open Titles permits authorised internal catalog readers without weakening role gates", () => {
  const gate = read("../../components/bridge/gate.tsx");
  const rbac = read("./rbac.ts");

  // The workspace gate is the single authority for Creator/Studio ownership
  // and internal title-catalog read permission.
  assert.match(gate, /allow === "workspace" && !canAccessTitleWorkspace\(profile\)/);
  assert.match(gate, /allow !== "workspace"/);
  assert.match(rbac, /if \(actor\.internalRole\) return hasPermission\(actor, "title\.read_catalog"\)/);
  assert.match(rbac, /actor\.internalRole === "super_admin"/);
});


test("Founder dashboard reuses the verified Super Admin gate and refreshes live data", () => {
  const dashboard = read("../../routes/dashboard.tsx");
  assert.match(dashboard, /<RequireBridge allow="super_admin">/);
  assert.doesNotMatch(dashboard, /getDashboardSession|Checking access/);
  assert.match(dashboard, /getFounderTrackedProductions\(\)/);
  assert.match(dashboard, /refetchInterval: 30_000/);
  assert.match(dashboard, /refetchOnWindowFocus: true/);
  assert.match(dashboard, /to="\/title\/\$id"/);
});

test("tracked Founder productions use exact canonical matches and reject ambiguous records", () => {
  const readModel = read("./founder-dashboard.ts");
  assert.match(readModel, /requireVerifiedActor\(context\.userId\)/);
  assert.match(readModel, /canAccessDashboard\(actor\)/);
  assert.match(readModel, /lower\(trim\(t\.slug\)\) = any/);
  assert.match(readModel, /regexp_replace\(lower\(trim\(t\.name\)\)/);
  assert.match(readModel, /matchStatus: matches\.length === 0 \? "not_found" : matches\.length === 1 \? "found" : "ambiguous"/);
  assert.doesNotMatch(readModel, /limit 200|\.includes\(/);
});


test("Founder Centre shows Original IP records separately with real author, rights and review states", () => {
  const dashboard = read("../../routes/dashboard.tsx");
  const desk = read("../../components/bridge/story-concept-desk.tsx");
  const api = read("./story-concept-api.ts");
  assert.match(dashboard, /<StoryConceptDesk\s*\/>/);
  assert.match(desk, /authorName/);
  assert.match(desk, /editorial_status/);
  assert.match(desk, /legal_status/);
  assert.match(desk, /rights_declaration_accepted_at/);
  assert.match(desk, /Save internal note/);
  assert.match(api, /t\.submission_type = 'story_concept'/);
  assert.match(api, /left join bridge_profiles p on p\.user_id = t\.owner_user_id/);
  assert.match(api, /fee_certified_at/);
  assert.match(api, /for update/);
  assert.match(api, /treatment_url: null/);
  assert.match(api, /adminNotes !== undefined/);
});

test("Story Concepts stay out of finished-film lists, admin review and buyer publication actions", () => {
  const titles = read("./titles.ts");
  const admin = read("./admin-workstations.ts");
  assert.match(titles, /coalesce\(submission_type, 'finished_film'\) = 'finished_film'/);
  assert.match(titles, /coalesce\(t\.submission_type, 'finished_film'\) = 'finished_film'/);
  assert.match(titles, /title\.submissionType === "story_concept"/);
  assert.match(titles, /Story \/ Concept records use the separate curation workflow/);
  assert.match(admin, /coalesce\(submission_type, 'finished_film'\) = 'finished_film'/);
  assert.match(admin, /Story \/ Concept records cannot enter the finished-film QC or rights lifecycle/);
  assert.match(admin, /Story \/ Concept records cannot receive film publication gates/);
});


test("Founder operations panel uses live Bridge payment, licensing and workflow aggregates", () => {
  const dashboard = read("../../routes/dashboard.tsx");
  const snapshot = read("./founder-dashboard.ts");
  assert.match(dashboard, /getFounderOperationalSnapshot\(\)/);
  assert.match(dashboard, /Payments, licensing & operations/);
  assert.match(snapshot, /bridge_payments/);
  assert.match(snapshot, /bridge_entitlements/);
  assert.match(snapshot, /bridge_license_packages/);
  assert.match(snapshot, /bridge_loop_publications/);
  assert.match(snapshot, /bridge_qc_cases/);
  assert.doesNotMatch(snapshot, /provider_payment_id|user_id|s3_key|signed_url/i);
});

test("Story Concept submissions require author rights declarations and avoid public document URLs", () => {
  const api = read("./story-concept-api.ts");
  const form = read("../../components/bridge/story-concept-form.tsx");
  const ownerDesk = read("../../components/bridge/my-story-concepts.tsx");
  const founderDesk = read("../../components/bridge/story-concept-desk.tsx");
  assert.match(api, /rightsDeclarationAccepted: z\.literal\(true\)/);
  assert.match(api, /rights_declaration_accepted_at = now\(\)/);
  assert.match(api, /The author must submit their own rights declaration/);
  assert.match(api, /story_concept\.rights_declaration/);
  assert.match(form, /Author & rights declaration/);
  assert.doesNotMatch(form, /Treatment URL|Screenplay URL/);
  assert.match(ownerDesk, /Submit rights declaration/);
  assert.doesNotMatch(ownerDesk, /to="\/title\/\$id"/);
  assert.match(founderDesk, /Approval locked: rights declaration is not verified/);
});
