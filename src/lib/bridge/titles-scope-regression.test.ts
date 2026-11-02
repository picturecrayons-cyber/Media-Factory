import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Creator and Studio list queries are owner and active-membership scoped", () => {
  const titles = read("./titles.ts");
  const listOwned = titles.slice(titles.indexOf("async function listOwned"), titles.indexOf("function slugify"));
  assert.match(listOwned, /owner_user_id = \$\{userId\}/);
  assert.match(listOwned, /owner_account_type = 'studio'/);
  assert.match(listOwned, /owner_organization_id = \$\{orgId\}/);
  assert.match(listOwned, /m\.organization_id = \$\{orgId\}/);
  assert.match(listOwned, /m\.user_id = \$\{userId\}/);
  assert.match(listOwned, /m\.status = 'active'/);
  assert.match(titles, /rows = await listOwned\(sql, actor\.userId, actor\.accountType === "studio" \? actor\.organizationId : null\)/);
});

test("title detail and mutation handlers enforce server-side owner checks", () => {
  const titles = read("./titles.ts");
  const getTitle = titles.slice(titles.indexOf("export const getTitle"), titles.indexOf("export const updateTitle"));
  const updateTitle = titles.slice(titles.indexOf("export const updateTitle"), titles.indexOf("async function assertLicensingReady"));
  assert.match(getTitle, /canReadTitle\(actor, title\)/);
  assert.match(getTitle, /if \(actor\.accountType !== "buyer"\) throw new Error\("Not found"\)/);
  assert.match(updateTitle, /canMutateTitle\(actor, title, "title\.update_own", "title\.license"\)/);
  assert.match(updateTitle, /Title is locked after prepare/);
  assert.match(updateTitle, /where id = \$\{title\.id\}/);
});

test("private asset operations re-check title ownership on every server action", () => {
  const assets = read("../bridge/assets.ts");
  assert.match(assets, /canOperateOnTitle\(actor, title, "asset\.sign_upload", "asset\.sign_upload"\)/);
  assert.match(assets, /async function openUploadAsset/);
  assert.match(assets, /async function openUploadAsset[\s\S]*?canOperateOnTitle/);
  assert.match(assets, /export const confirmAssetUpload[\s\S]*?canOperateOnTitle/);
  assert.match(assets, /export const requestAssetUpload[\s\S]*?assertPermission\(actor/);
});

test("workflow endpoints separate owner drafts from QC/legal staff review", () => {
  const workflow = read("../bridge/workflow.ts");
  assert.match(workflow, /canOperateOnTitle\([\s\S]*?"title\.update_own"[\s\S]*?"title\.license"/);
  assert.match(workflow, /assertPermission\(actor, data\.stage === "QC" \? "title\.qc_review" : "title\.rights_review"\)/);
  assert.match(workflow, /!canReadTitle\(actor, title\)/);
  assert.match(workflow, /\(!actor\.internalRole && actor\.accountType === "buyer"\)/);
});

test("STAGING smoke is bound to the currently approved Bridge Testing DB and checks ACL before fixtures", () => {
  const smoke = read("../../../scripts/staging-rbac-smoke.mjs");
  assert.match(smoke, /const REQUIRED_PROJECT_REF = "jbymleftneggcgutlcqu"/);
  assert.match(smoke, /to_regclass\('public\.bridge_organizations'\)/);
  assert.match(smoke, /to_regclass\('public\.bridge_organization_memberships'\)/);
  assert.ok(smoke.indexOf("anon and authenticated must not retain") < smoke.indexOf("seedStagingRbacFixtures(client)"));
  assert.match(smoke, /ROLLBACK/);
});
