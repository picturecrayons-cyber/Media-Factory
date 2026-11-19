import assert from "node:assert/strict";
import test from "node:test";
import { sameOwner, isSupportedCreatorDocumentMimeType, hasPdfMagicBytes, canDownloadCreatorDocument, canManageStudioDocuments } from "./creator-document-policy.ts";

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

test("only an active Studio owner can manage reusable organization documents", () => {
  assert.equal(canManageStudioDocuments({ accountType: "studio", organizationId: "org-a", organizationRole: "owner" }), true);
  assert.equal(canManageStudioDocuments({ accountType: "studio", organizationId: "org-a", organizationRole: "member" }), false);
  assert.equal(canManageStudioDocuments({ accountType: "studio", organizationId: "org-a", organizationRole: null }), false);
  assert.equal(canManageStudioDocuments({ accountType: "studio", organizationId: null, organizationRole: "owner" }), false);
  assert.equal(canManageStudioDocuments({ accountType: "independent_creator" }), true);
});

test("legal evidence upload accepts PDF only", () => {
  assert.equal(isSupportedCreatorDocumentMimeType("application/pdf"), true);
  assert.equal(isSupportedCreatorDocumentMimeType("text/html"), false);
  assert.equal(isSupportedCreatorDocumentMimeType("application/octet-stream"), false);
});

test("PDF uploads must contain the actual PDF file signature, not only a PDF MIME header", () => {
  assert.equal(hasPdfMagicBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), true);
  assert.equal(hasPdfMagicBytes(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e])), false);
  assert.equal(hasPdfMagicBytes(new Uint8Array([0x25, 0x50, 0x44])), false);
});

test("document downloads require ownership, linked-title review scope, or Super Admin", () => {
  assert.equal(canDownloadCreatorDocument({ ownerAccess: true, linkedTitleAccess: false, isSuperAdmin: false }), true);
  assert.equal(canDownloadCreatorDocument({ ownerAccess: false, linkedTitleAccess: true, isSuperAdmin: false }), true);
  assert.equal(canDownloadCreatorDocument({ ownerAccess: false, linkedTitleAccess: false, isSuperAdmin: true }), true);
  assert.equal(canDownloadCreatorDocument({ ownerAccess: false, linkedTitleAccess: false, isSuperAdmin: false }), false);
});
