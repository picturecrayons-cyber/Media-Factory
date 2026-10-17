import test from "node:test";
import assert from "node:assert/strict";
import { canUploadTitleAssets } from "./upload-ui-policy.ts";

const verifiedSuperAdmin = { emailVerified: true, internalRole: "super_admin" as const };

test("verified Super Admin can upload only in allowed title states", () => {
  for (const status of ["DRAFT", "UPLOADING", "PREPARING", "LIVE_FOR_BUYERS"] as const) {
    assert.equal(canUploadTitleAssets(verifiedSuperAdmin, status), true, status);
  }
  assert.equal(canUploadTitleAssets(verifiedSuperAdmin, "QC_REVIEW"), false);
  assert.equal(canUploadTitleAssets(verifiedSuperAdmin, "DELIVERED"), false);
});

test("upload permission fails closed for unverified and non-Super-Admin actors", () => {
  assert.equal(canUploadTitleAssets({ emailVerified: false, internalRole: "super_admin" }, "DRAFT"), false);
  assert.equal(canUploadTitleAssets({ emailVerified: true, internalRole: "admin" }, "DRAFT"), false);
  assert.equal(canUploadTitleAssets({ emailVerified: true, internalRole: null }, "DRAFT"), false);
});
