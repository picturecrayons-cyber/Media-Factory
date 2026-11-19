import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sameOwner, isSupportedCreatorDocumentMimeType, hasPdfMagicBytes, canDownloadCreatorDocument, canManageStudioDocuments, canReviewTitleDocuments } from "./creator-document-policy.ts";

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

test("only an active Studio owner or admin can manage reusable organization documents", () => {
  assert.equal(canManageStudioDocuments({ accountType: "studio", organizationId: "org-a", organizationRole: "owner" }), true);
  assert.equal(canManageStudioDocuments({ accountType: "studio", organizationId: "org-a", organizationRole: "admin" }), true);
  assert.equal(canManageStudioDocuments({ accountType: "studio", organizationId: "org-a", organizationRole: "member" }), false);
  assert.equal(canManageStudioDocuments({ accountType: "studio", organizationId: "org-a", organizationRole: null }), false);
  assert.equal(canManageStudioDocuments({ accountType: "studio", organizationId: null, organizationRole: "owner" }), false);
  assert.equal(canManageStudioDocuments({ accountType: "independent_creator" }), true);
});

test("Legal Reviewer document access requires the Legal Reviewer role and rights-review permission", () => {
  assert.equal(canReviewTitleDocuments({ internalRole: "legal_reviewer", hasRightsReviewPermission: true }), true);
  assert.equal(canReviewTitleDocuments({ internalRole: "legal_reviewer", hasRightsReviewPermission: false }), false);
  assert.equal(canReviewTitleDocuments({ internalRole: "viewer", hasRightsReviewPermission: true }), false);
  assert.equal(canReviewTitleDocuments({ internalRole: null, hasRightsReviewPermission: true }), false);
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

test("Legal Reviewer document downloads require an explicit title assignment", () => {
  const source = readFileSync(new URL("./creator-documents.ts", import.meta.url), "utf8");
  assert.match(source, /actor\.internalRole !== "super_admin"/);
  assert.match(source, /internal_role='legal_reviewer'/);
  assert.match(source, /bridge_title_document_review_assignments/);
  assert.match(source, /a\.reviewer_user_id=\$\{actor\.userId\}/);
  assert.match(source, /a\.status='ACTIVE'/);
});

test("document downloads require ownership, linked-title review scope, or Super Admin", () => {
  assert.equal(canDownloadCreatorDocument({ ownerAccess: true, linkedTitleAccess: false, isSuperAdmin: false }), true);
  assert.equal(canDownloadCreatorDocument({ ownerAccess: false, linkedTitleAccess: true, isSuperAdmin: false }), true);
  assert.equal(canDownloadCreatorDocument({ ownerAccess: false, linkedTitleAccess: false, isSuperAdmin: true }), true);
  assert.equal(canDownloadCreatorDocument({ ownerAccess: false, linkedTitleAccess: false, isSuperAdmin: false }), false);
});

test("revoked Legal Reviewer assignments remain historical and reassignments create a new active row", () => {
  const migration = readFileSync(new URL("../../../supabase/migrations/20261118143000_bridge_creator_document_vault.sql", import.meta.url), "utf8");
  const source = readFileSync(new URL("./creator-documents.ts", import.meta.url), "utf8");
  assert.match(migration, /drop constraint if exists bridge_title_document_review_assignments_title_id_reviewer_user_id_key/);
  assert.match(migration, /create unique index if not exists bridge_title_document_review_assignments_active_unique[\\s\\S]*where status='ACTIVE'/);
  assert.match(source, /on conflict \\(title_id,reviewer_user_id\\) where status='ACTIVE' do update/);
  assert.match(source, /status='ACTIVE'/);
});
