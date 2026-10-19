import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canDownloadAsset,
  canPreviewAsset,
  canReplaceAsset,
  canViewAsset,
} from "./asset-access-policy.ts";
import type { Actor } from "./rbac.ts";
import type { TitleStatus } from "./types.ts";

const actor = (
  userId: string,
  accountType: Actor["accountType"],
  internalRole: Actor["internalRole"] = null,
  emailVerified = true,
): Actor => ({ userId, accountType, internalRole, emailVerified });
const title = (ownerUserId = "creator-a", status: TitleStatus = "DRAFT") => ({ ownerUserId, status });
const creator = (id = "creator-a", verified = true) => actor(id, "independent_creator", null, verified);
const buyer = () => actor("buyer-a", "buyer");
const qc = () => actor("qc-a", "independent_creator", "qc_reviewer");
const legal = () => actor("legal-a", "independent_creator", "legal_reviewer");
const admin = () => actor("admin-a", "independent_creator", "admin");
const superAdmin = () => actor("super-a", "independent_creator", "super_admin");

describe("Bridge asset access policy", () => {
  it("requires verified email for viewing and replacement", () => {
    const unverified = creator("creator-a", false);
    assert.equal(canViewAsset(unverified, title(), "master"), false);
    assert.equal(canPreviewAsset(unverified, title(), "master"), false);
    assert.equal(canReplaceAsset(unverified, title()), false);
  });

  it("allows owners to view and preview their assets but not unrelated creators", () => {
    assert.equal(canViewAsset(creator(), title(), "technical"), true);
    assert.equal(canPreviewAsset(creator(), title(), "technical"), false);
    assert.equal(canViewAsset(creator("creator-b"), title(), "poster"), false);
    assert.equal(canPreviewAsset(creator("creator-b"), title(), "poster"), false);
  });

  it("limits QC and legal reviewers to their permitted asset kinds", () => {
    for (const kind of ["master", "screener", "subtitle", "poster", "thumbnail"]) {
      assert.equal(canViewAsset(qc(), title(), kind), true, `QC should view ${kind}`);
    }
    assert.equal(canViewAsset(qc(), title(), "technical"), false);
    assert.equal(canPreviewAsset(qc(), title(), "technical"), false);
    assert.equal(canViewAsset(legal(), title(), "censor_certificate"), true);
    assert.equal(canViewAsset(legal(), title(), "master"), false);
    assert.equal(canPreviewAsset(legal(), title(), "master"), false);
  });

  it("requires buyer entitlement, a buyer-visible title state, and an allowed kind", () => {
    const b = buyer();
    assert.equal(canViewAsset(b, title("creator-a", "LIVE_FOR_BUYERS"), "screener", false), false);
    assert.equal(canPreviewAsset(b, title("creator-a", "LIVE_FOR_BUYERS"), "screener", false), false);
    assert.equal(canViewAsset(b, title("creator-a", "LIVE_FOR_BUYERS"), "screener", true), true);
    assert.equal(canPreviewAsset(b, title("creator-a", "LIVE_FOR_BUYERS"), "screener", true), true);
    assert.equal(canViewAsset(b, title("creator-a", "DRAFT"), "screener", true), false);
    assert.equal(canViewAsset(b, title("creator-a", "LIVE_FOR_BUYERS"), "master", true), false);
  });

  it("distinguishes admin and super-admin viewing from replacement authority", () => {
    assert.equal(canViewAsset(admin(), title("creator-a"), "master"), true);
    assert.equal(canPreviewAsset(admin(), title("creator-a"), "master"), true);
    assert.equal(canReplaceAsset(admin(), title("creator-a")), false);
    assert.equal(canReplaceAsset(superAdmin(), title("creator-a")), true);
    assert.equal(canReplaceAsset(superAdmin(), title("creator-a", "QC_REVIEW")), false);
  });

  it("permits owners to replace only in uploadable lifecycle states", () => {
    for (const status of ["DRAFT", "UPLOADING", "PREPARING"] as const) {
      assert.equal(canReplaceAsset(creator(), title("creator-a", status)), true);
    }
    for (const status of ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"] as const) {
      assert.equal(canReplaceAsset(creator(), title("creator-a", status)), false);
    }
    assert.equal(canReplaceAsset(creator("creator-b"), title("creator-a")), false);
  });

  it("requires explicit download permission and denies buyer access without entitlement", () => {
    assert.equal(canDownloadAsset(buyer(), title("creator-a", "LIVE_FOR_BUYERS"), "screener", false), false);
    assert.equal(canDownloadAsset(buyer(), title("creator-a", "LIVE_FOR_BUYERS"), "screener", true), true);
    assert.equal(canDownloadAsset(creator(), title(), "master"), true);
    assert.equal(canDownloadAsset(actor("viewer-a", "independent_creator", "viewer"), title(), "master"), false);
  });
});
