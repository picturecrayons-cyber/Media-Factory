import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSuperAdminReadOnlySurface, normalizeRole } from "./super-admin-readonly.ts";

test("super_admin is read-only on buyer and workspace surfaces", () => {
  assert.equal(isSuperAdminReadOnlySurface("super_admin", "buyer"), true);
  assert.equal(isSuperAdminReadOnlySurface("super_admin", "workspace"), true);
});

test("admin remains writable on buyer and workspace surfaces", () => {
  assert.equal(isSuperAdminReadOnlySurface("admin", "buyer"), false);
  assert.equal(isSuperAdminReadOnlySurface("admin", "workspace"), false);
});

test("role normalization trims and lowercases", () => {
  assert.equal(normalizeRole(" Super_Admin "), "super_admin");
  assert.equal(isSuperAdminReadOnlySurface(" Super_Admin ", "workspace"), true);
});

test("mapped mutation handlers contain guards before side-effect calls", () => {
  const cases = [
    ["src/lib/bridge/titles.ts", "createTitle", "workspace", ["getSql(", "insert into bridge_titles"]],
    ["src/lib/bridge/titles.ts", "updateTitle", "workspace", ["loadTitle(", "getSql("]],
    ["src/lib/bridge/titles.ts", "advanceTitle", "workspace", ["loadTitle(", "getSql("]],
    ["src/lib/bridge/assets.ts", "requestAssetUpload", "workspace", ["signUpload(", "getSql("]],
    ["src/lib/bridge/assets.ts", "confirmAssetUpload", "workspace", ["getSql(", "verifyObject("]],
    ["src/lib/bridge/payments.ts", "createLicenseOrder", "buyer", ["assertBuyerPublishable(", "razorpayFetch("]],
    ["src/lib/bridge/payments.ts", "verifyLicensePayment", "buyer", ["requireRazorpayKeys(", "grantFromCapturedPayment("]],
    ["src/lib/bridge/workflow.ts", "submitLoopLicense", "workspace", ["getSql("]],
    ["src/lib/bridge/workflow.ts", "reviewTitleWorkflow", "workspace", ["getSql("]],
    ["src/lib/bridge/loop-publication.ts", "authorizeLoopPublication", "workspace", ["getSql("]],
    ["src/lib/bridge/loop-publication.ts", "suspendLoopPublication", "workspace", ["getSql("]],
    ["src/lib/bridge/loop-publication.ts", "revokeLoopPublication", "workspace", ["getSql("]],
    ["src/lib/bridge/loop-publication.ts", "extendDistributionWindow", "workspace", ["getSql("]],
  ] as const;
  for (const [path, name, surface, effects] of cases) {
    const source = readFileSync(new URL(path.slice(path.lastIndexOf("/") + 1), import.meta.url), "utf8");
    const start = source.indexOf(`export const ${name} = createServerFn`);
    assert.notEqual(start, -1, `${name} handler exists`);
    const end = source.indexOf("\nexport const ", start + 1);
    const handler = source.slice(start, end < 0 ? source.length : end);
    const guard = handler.indexOf(`isSuperAdminReadOnlySurface(actor.internalRole ?? undefined, "${surface}")`);
    assert.notEqual(guard, -1, `${name} has the ${surface} guard`);
    for (const effect of effects) {
      const at = handler.indexOf(effect);
      if (at >= 0) assert.ok(guard < at, `${name} guards before ${effect}`);
    }
  }
});
