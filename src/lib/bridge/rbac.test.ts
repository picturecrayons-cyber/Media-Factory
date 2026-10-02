import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPermission, canReadTitle, hasPermission, permissionForTransition, workspaceHome } from "./rbac.ts";
import type { Actor } from "./rbac.ts";

const actor = (userId: string, accountType: Actor["accountType"], internalRole: Actor["internalRole"] = null, emailVerified = true): Actor =>
  ({ userId, emailVerified, accountType, internalRole });
const creator = (verified = true) => actor("creator-a", "independent_creator", null, verified);
const studio = () => actor("studio-a", "studio");
const buyer = () => actor("buyer-a", "buyer");
const admin = () => actor("admin-a", "independent_creator", "admin");
const superAdmin = () => actor("super-a", "independent_creator", "super_admin");
const qc = actor("qc1", "independent_creator", "qc_reviewer");

describe("PRD authorization matrix", () => {
  it("fails closed until email is verified", () => {
    assert.equal(hasPermission(creator(false), "title.create"), false);
    assert.throws(() => assertPermission(creator(false), "title.create"), /Email verification/);
  });

  it("creator and studio can manage only their own private titles", () => {
    for (const owner of [creator(), studio()]) {
      assert.equal(hasPermission(owner, "title.create"), true);
      assert.equal(hasPermission(owner, "asset.sign_upload"), true);
      assert.equal(canReadTitle(owner, { ownerUserId: owner.userId, status: "DRAFT" }), true);
      assert.equal(canReadTitle(owner, { ownerUserId: "other-org-user", status: "DRAFT" }), false);
      assert.equal(canReadTitle(owner, { ownerUserId: "other-org-user", status: "LIVE_FOR_BUYERS" }), false);
      assert.equal(hasPermission(owner, "title.qc_review"), false);
      assert.equal(hasPermission(owner, "title.license"), false);
    }
  });

  it("buyer sees buyer-visible catalog but cannot create, upload, QC, license, or administer", () => {
    const b = buyer();
    assert.equal(canReadTitle(b, { ownerUserId: "creator-a", status: "DRAFT" }), false);
    assert.equal(canReadTitle(b, { ownerUserId: "creator-a", status: "LIVE_FOR_BUYERS" }), true);
    for (const permission of ["title.create","asset.sign_upload","title.qc_review","title.license","users.invite_internal"] as const) {
      assert.equal(hasPermission(b, permission), false);
    }
    assert.equal(hasPermission(b, "payment.create_order"), true);
  });

  it("admin combines internal operator permissions with its account-type permissions", () => {
    const a = admin();
    assert.equal(hasPermission(a, "title.read_catalog"), true);
    assert.equal(hasPermission(a, "title.qc_review"), true);
    assert.equal(hasPermission(a, "title.rights_review"), true);
    assert.equal(hasPermission(a, "users.invite_internal"), true);
    assert.equal(hasPermission(a, "title.create"), true);
    assert.equal(hasPermission(a, "asset.sign_upload"), true);
    assert.equal(canReadTitle(a, { ownerUserId: "other-org-user", status: "DRAFT" }), true);
  });

  it("only super admin combines operator and creator-side powers", () => {
    const a = superAdmin();
    assert.equal(hasPermission(a, "title.create"), true);
    assert.equal(hasPermission(a, "asset.sign_upload"), true);
    assert.equal(hasPermission(a, "users.invite_internal"), true);
  });

  it("signed asset permissions are role scoped", () => {
    assert.equal(hasPermission(creator(), "asset.sign_upload"), true);
    assert.equal(hasPermission(studio(), "asset.sign_upload"), true);
    assert.equal(hasPermission(buyer(), "asset.sign_upload"), false);
    assert.equal(hasPermission(buyer(), "asset.sign_download"), true);
    assert.equal(hasPermission(qc, "asset.sign_download"), true);
  });

  it("maps lifecycle steps to separated duties and withholds LICENSED", () => {
    assert.equal(permissionForTransition("DRAFT", "UPLOADING"), "title.advance_upload");
    assert.equal(permissionForTransition("QC_REVIEW", "RIGHTS_REVIEW"), "title.qc_review");
    assert.equal(permissionForTransition("RIGHTS_REVIEW", "LICENSING_READY"), "title.rights_review");
    assert.equal(permissionForTransition("IN_NEGOTIATION", "LICENSED"), null);
  });

  it("routes authenticated roles to their role workspace", () => {
    assert.equal(workspaceHome(creator()), "/creator");
    assert.equal(workspaceHome(studio()), "/studio");
    assert.equal(workspaceHome(buyer()), "/buyer");
    assert.equal(workspaceHome(admin()), "/dashboard");
    assert.equal(workspaceHome(qc), "/dashboard");
  });
});
