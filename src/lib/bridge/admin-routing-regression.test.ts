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

test("Buyer title, asset-list and direct-download paths independently require publication eligibility", () => {
  const titles = read("./titles.ts");
  const assets = read("./assets.ts");
  assert.match(titles, /actor\.accountType === "buyer" && !actor\.internalRole[\s\S]{0,260}assertBuyerPublishable\(title\.id\)/);
  assert.match(assets, /Direct asset-ID requests must satisfy the same publication gate[\s\S]{0,240}assertBuyerPublishable\(title\.id\)/);
  assert.match(assets, /Asset enumeration is a separate endpoint[\s\S]{0,240}assertBuyerPublishable\(title\.id\)/);
  assert.match(assets, /if \(actor\.accountType === "buyer" && !actor\.internalRole && !entitled\)/);
  assert.match(assets, /where user_id = \$\{userId\} and title_id = \$\{titleId\} and access_type = 'license'/);
});

test("Loop readiness GET is read-only and generic reviewer approvals are evidence-bound", () => {
  const publication = read("./loop-publication.ts");
  const workstation = read("./admin-workstations.ts");
  const readiness = publication.slice(
    publication.indexOf("export const listLoopPublicationReadiness"),
    publication.indexOf("export const authorizeLoopPublication"),
  );
  assert.doesNotMatch(readiness, /\b(update|insert|delete)\s+(?:bridge_loop_publications|loop_titles)/i);
  assert.match(workstation, /Verified current master and poster versions are required for QC approval/);
  assert.match(workstation, /masterKey: title\.master_key[\s\S]*posterKey: title\.poster_key/);
  assert.match(workstation, /created_by <> \$\{actor\.userId\}/);
  assert.match(workstation, /Exactly one active, complete rights draft from another user is required/);
  assert.match(workstation, /grantId: grant\.id/);
});

test("Buyer publication SQL binds the selected package to active rights and exact current QC/Legal evidence", () => {
  const migration = read("../../../migrations/0022_bridge_buyer_publication_evidence.sql");
  assert.match(migration, /join public\.bridge_rights_grants r[\s\S]*r\.id = p\.rights_grant_id/);
  assert.match(migration, /r\.status = 'VALID'[\s\S]*r\.window_end > now\(\)/);
  assert.match(migration, /q\.id = p\.qc_case_id[\s\S]*q\.reviewer_findings -> 0 ->> 'masterKey' = t\.master_key[\s\S]*q\.reviewer_findings -> 0 ->> 'posterKey' = t\.poster_key/);
  assert.match(migration, /l\.id = p\.legal_case_id[\s\S]*l\.evidence -> 0 ->> 'grantId' = r\.id::text/);
});
