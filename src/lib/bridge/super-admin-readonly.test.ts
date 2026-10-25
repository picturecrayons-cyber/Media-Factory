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

test("role normalization trims whitespace and lowercases", () => {
  assert.equal(normalizeRole(" Super_Admin "), "super_admin");
  assert.equal(isSuperAdminReadOnlySurface(" Super_Admin ", "workspace"), true);
});

test("all mapped mutation handlers guard before side-effect calls", () => {
  const cases = [
    ["titles.ts", "createTitle", "workspace", ["getSql(", "insert into bridge_titles"]],
    ["titles.ts", "updateTitle", "workspace", ["loadTitle(", "getSql("]],
    ["titles.ts", "advanceTitle", "workspace", ["loadTitle(", "getSql("]],
    ["assets.ts", "requestAssetUpload", "workspace", ["signUpload(", "getSql("]],
    ["assets.ts", "confirmAssetUpload", "workspace", ["getSql(", "verifyObject("]],
    ["payments.ts", "createLicenseOrder", "buyer", ["assertBuyerPublishable(", "razorpayFetch("]],
    ["payments.ts", "verifyLicensePayment", "buyer", ["requireRazorpayKeys(", "grantFromCapturedPayment("]],
    ["workflow.ts", "submitLoopLicense", "workspace", ["getSql("]],
    ["workflow.ts", "reviewTitleWorkflow", "workspace", ["getSql("]],
    ["loop-publication.ts", "authorizeLoopPublication", "workspace", ["getSql("]],
    ["loop-publication.ts", "suspendLoopPublication", "workspace", ["getSql("]],
    ["loop-publication.ts", "revokeLoopPublication", "workspace", ["getSql("]],
    ["loop-publication.ts", "extendDistributionWindow", "workspace", ["getSql("]],
  ] as const;

  for (const [file, name, surface, sideEffects] of cases) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const start = source.indexOf(`export const ${name} = createServerFn`);
    assert.notEqual(start, -1, `${name} handler exists`);
    const end = source.indexOf("\nexport const ", start + 1);
    const handler = source.slice(start, end < 0 ? source.length : end);
    const guard = handler.indexOf(
      `isSuperAdminReadOnlySurface(actor.internalRole ?? undefined, "${surface}")`,
    );
    assert.notEqual(guard, -1, `${name} has a ${surface} guard`);
    for (const effect of sideEffects) {
      const at = handler.indexOf(effect);
      if (at >= 0) {
        assert.ok(guard < at, `${name} guards before ${effect}`);
      }
    }
  }
});
