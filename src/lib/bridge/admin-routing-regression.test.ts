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

test("Studio package workflow actions fail closed until all seven storage-verified files are present", () => {
  const workflowDesk = read("../../components/bridge/workflow-desk.tsx");
  const titleRoute = read("../../routes/title.$id.tsx");
  const titles = read("./titles.ts");
  const readiness = read("./qc-readiness.ts");
  assert.match(readiness, /REQUIRED_QC_FILES/);
  assert.match(readiness, /assertSevenFilesStorageVerified/);
  assert.match(readiness, /assets\.find\(\(asset\) => required\.kinds/);
  assert.match(workflowDesk, /assetsQuery\.data\?\.assets\.find/);
  assert.match(titleRoute, /const latest = assets\.find/);
  assert.match(workflowDesk, /qcFileCount === 7/);
  assert.match(workflowDesk, /\["UPLOADING", "PREPARING"\]\.includes\(title\.status\) && !qcFilesReady/);
  assert.match(titles, /data\.to === "PREPARING"\) await assertSevenFilesStorageVerified/);
  assert.match(titles, /data\.to === "QC_REVIEW"\) await assertVerifiedTitleIngestReady/);
  assert.match(titles, /a\.kind in \('poster', 'poster_vertical'\)/);
});

test("Buyer title DTO and asset responses strip storage keys and internal workflow history", () => {
  const titles = read("./titles.ts");
  const assets = read("./assets.ts");
  const buyerRoute = read("../../routes/title.$id.tsx");
  const workflow = read("./workflow.ts");
  const publication = read("./loop-publication.ts");
  assert.match(workflow, /\(!actor\.internalRole && actor\.accountType === "buyer"\)/);
  assert.match(publication, /actor\.accountType === "buyer" && !actor\.internalRole\) throw new Error\("Forbidden"\)/);
  assert.match(titles, /function mapBuyerTitle/);
  assert.match(titles, /posterKey: null/);
  assert.match(titles, /masterKey: null/);
  assert.match(titles, /events: buyer \? \[\]/);
  assert.match(titles, /await assertBuyerPublishable\(title\.id\)/);
  assert.match(assets, /\.\.\.\(buyer \? \{\} : \{\s*key: r\.s3_key/);
  assert.match(assets, /not \$\{buyer\} or byte_size > 0/);
  assert.match(assets, /\.\.\.\(buyer \? \{\} : \{/);
  assert.match(buyerRoute, /Authorized buyer listing/);
  assert.doesNotMatch(buyerRoute, /Upload Files[\s\S]{0,80}actor\.accountType === "buyer"/);
});

test("Buyer media previews use short-lived signed first-party streaming tokens", () => {
  const assets = read("./assets.ts");
  const route = read("../../routes/api/assets/stream.ts");
  const previewUrl = read("./preview-url.ts");
  const gallery = read("../../components/bridge/asset-preview-gallery.tsx");
  const routeTree = read("../../routeTree.gen.ts");
  assert.doesNotMatch(gallery, /<\/article>\s*<\/article>/);
  assert.match(gallery, /const latestPoster = assets\.find/);
  assert.match(gallery, /const seenKinds = new Set/);
  assert.match(routeTree, /ApiAssetsStreamRouteImport/);
  assert.match(routeTree, /ApiAssetsStreamRoute: ApiAssetsStreamRoute/);
  assert.match(assets, /createCipheriv/);
  assert.match(assets, /createDecipheriv/);
  assert.match(assets, /cipher\.getAuthTag\(\)/);
  assert.match(assets, /decipher\.setAuthTag\(tag\)/);
  assert.match(assets, /expiresAt: Math\.floor\(Date\.now\(\) \/ 1000\) \+ 4 \* 60 \* 60/);
  assert.match(assets, /assertBuyerPublishable\(title\.id\)/);
  assert.match(assets, /return \{ url: "\/api\/assets\/stream\?token="/);
  assert.match(route, /streamAssetWithToken\(token, request\.headers\.get\("range"\)\)/);
  assert.match(previewUrl, /if \(signedUrl\.startsWith\("\/"\)\) return signedUrl/);
  assert.doesNotMatch(assets, /return \{ url: signed\.url/);
});

test("Internal Audit tools are role restricted and test-data cleanup remains dry-run only", () => {
  const admin = read("./admin-workstations.ts");
  const workstation = read("../../routes/admin/workstations.tsx");
  assert.match(admin, /function assertStorageAdmin/);
  assert.match(admin, /verifyBucketAccess/);
  assert.match(admin, /verifyObject/);
  assert.match(admin, /listTestDataCleanupCandidates/);
  assert.match(admin, /assertTestingDatabaseForCleanup/);
  assert.match(admin, /bridgeEnv\.databaseUrl\(\)/);
  assert.match(admin, /databaseIdentity\.includes\(expectedProject\)/);
  assert.match(admin, /jbymleftneggcgutlcqu/);
  assert.match(admin, /destructive: false/);
  assert.match(workstation, /Internal Audit/);
  assert.match(workstation, /Test-data cleanup preview/);
  assert.match(workstation, /This tool does not delete database rows/);
});
