import assert from "node:assert/strict";
import test from "node:test";
import { sameOwner, isSupportedCreatorDocumentMimeType, creatorDocumentListFailureMessage } from "./creator-document-policy.ts";

test("Creator document vault is isolated to the owning Creator account", () => {
  const document = {
    owner_user_id: "creator-a",
    owner_account_type: "independent_creator",
    owner_organization_id: null,
  };
  assert.equal(sameOwner({ userId: "creator-a", accountType: "independent_creator" }, document), true);
  assert.equal(sameOwner({ userId: "creator-b", accountType: "independent_creator" }, document), false);
  assert.equal(sameOwner({ userId: "creator-a", accountType: "studio", organizationId: "org-a" }, document), false);
});

test("Studio document access requires the exact active organization scope", () => {
  const document = {
    owner_user_id: "studio-member-a",
    owner_account_type: "studio",
    owner_organization_id: "org-a",
  };
  assert.equal(sameOwner({ userId: "studio-member-b", accountType: "studio", organizationId: "org-a" }, document), true);
  assert.equal(sameOwner({ userId: "studio-member-a", accountType: "studio", organizationId: "org-b" }, document), false);
  assert.equal(sameOwner({ userId: "studio-member-a", accountType: "studio" }, document), false);
  assert.equal(sameOwner({ userId: "studio-member-a", accountType: "independent_creator", organizationId: "org-a" }, document), false);
});

test("legal evidence upload accepts PDF only", () => {
  assert.equal(isSupportedCreatorDocumentMimeType("application/pdf"), true);
  assert.equal(isSupportedCreatorDocumentMimeType("text/html"), false);
  assert.equal(isSupportedCreatorDocumentMimeType("application/octet-stream"), false);
});

test("Document Vault list failures return a retryable reference without leaking database details", () => {
  const message = creatorDocumentListFailureMessage("a1b2c3d4");
  assert.match(message, /temporarily unavailable/);
  assert.match(message, /Retry the request/);
  assert.match(message, /a1b2c3d4/);
  assert.doesNotMatch(message, /postgres|database_url|secret|password/i);
});
