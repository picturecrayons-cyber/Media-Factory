import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertPermission,
  canAccessDashboard,
  canGrantInternalRole,
  canMutateTitle,
  canOperateOnTitle,
  canReadTitle,
  hasPermission,
  permissionForTransition,
  workspaceHome,
} from "./rbac.ts";
import type { Actor } from "./rbac.ts";

const actor = (
  userId: string,
  accountType: Actor["accountType"],
  internalRole: Actor["internalRole"] = null,
  emailVerified = true,
): Actor => ({ userId, emailVerified, accountType, internalRole });
const creator = (verified = true) => actor("creator-a", "independent_creator", null, verified);
const studio = () => actor("studio-a", "studio");
const buyer = () => actor("buyer-a", "buyer");
const admin = () => actor("admin-a", "independent_creator", "admin");
const superAdmin = () => actor("super-a", "independent_creator", "super_admin");
const viewer = () => actor("viewer-a", "independent_creator", "viewer");
const qc = actor("qc1", "independent_creator", "qc_reviewer");
const legal = actor("legal1", "independent_creator", "legal_reviewer");
const finance = actor("finance1", "independent_creator", "finance");

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
      assert.equal(
        canReadTitle(owner, { ownerUserId: "other-org-user", status: "LIVE_FOR_BUYERS" }),
        false,
      );
      assert.equal(hasPermission(owner, "title.qc_review"), false);
      assert.equal(hasPermission(owner, "title.license"), false);
    }
  });

  it("buyer sees buyer-visible catalog but cannot create, upload, QC, license, or administer", () => {
    const b = buyer();
    assert.equal(canReadTitle(b, { ownerUserId: "creator-a", status: "DRAFT" }), false);
    assert.equal(canReadTitle(b, { ownerUserId: "creator-a", status: "LIVE_FOR_BUYERS" }), true);
    for (const permission of [
      "title.create",
      "asset.sign_upload",
      "title.qc_review",
      "title.license",
      "users.invite_internal",
    ] as const) {
      assert.equal(hasPermission(b, permission), false);
    }
    assert.equal(hasPermission(b, "payment.create_order"), true);
  });

  it("all internal roles stay within explicit staff permissions even with mixed account types", () => {
    for (const roleActor of [viewer(), qc, legal, finance, admin(), superAdmin()]) {
      assert.equal(hasPermission(roleActor, "title.create"), false);
      assert.equal(hasPermission(roleActor, "asset.sign_upload"), false);
      assert.equal(hasPermission(roleActor, "payment.create_order"), false);
    }
    const a = admin();
    assert.equal(hasPermission(a, "title.read_catalog"), true);
    assert.equal(hasPermission(a, "title.qc_review"), true);
    assert.equal(hasPermission(a, "users.invite_internal"), true);
    assert.equal(hasPermission(a, "title.create"), false);
    assert.equal(hasPermission(a, "asset.sign_upload"), false);
    assert.equal(canReadTitle(a, { ownerUserId: "other-org-user", status: "DRAFT" }), true);
    assert.equal(hasPermission(viewer(), "asset.sign_download"), false);
  });

  it("mixed account/staff roles never regain owner mutations through ownership alone", () => {
    const owned = { ownerUserId: "admin-a" };
    assert.equal(canOperateOnTitle(admin(), owned, "asset.sign_upload"), false);
    assert.equal(canMutateTitle(admin(), owned, "title.update_own", "title.license"), true);
    assert.equal(
      canOperateOnTitle(viewer(), { ownerUserId: "viewer-a" }, "title.advance_upload"),
      false,
    );
    assert.equal(
      canMutateTitle(viewer(), { ownerUserId: "viewer-a" }, "title.update_own", "title.license"),
      false,
    );
  });

  it("cross-title and direct-operation checks require explicit staff permissions", () => {
    const foreign = { ownerUserId: "creator-b" };
    assert.equal(canOperateOnTitle(creator(), foreign, "asset.sign_upload"), false);
    assert.equal(canOperateOnTitle(qc, foreign, "asset.sign_upload"), false);
    assert.equal(canMutateTitle(qc, foreign, "title.update_own", "title.qc_review"), true);
    assert.equal(canMutateTitle(viewer(), foreign, "title.update_own", "title.qc_review"), false);
  });

  it("super admin remains staff-scoped instead of inheriting creator powers", () => {
    const a = superAdmin();
    assert.equal(hasPermission(a, "title.create"), false);
    assert.equal(hasPermission(a, "asset.sign_upload"), false);
    assert.equal(hasPermission(a, "users.invite_internal"), true);
    assert.equal(hasPermission(a, "title.license"), true);
  });

  it("signed asset permissions are role scoped", () => {
    assert.equal(hasPermission(creator(), "asset.sign_upload"), true);
    assert.equal(hasPermission(studio(), "asset.sign_upload"), true);
    assert.equal(hasPermission(buyer(), "asset.sign_upload"), false);
    assert.equal(hasPermission(buyer(), "asset.sign_download"), true);
    assert.equal(hasPermission(qc, "asset.sign_download"), true);
    assert.equal(hasPermission(viewer(), "asset.sign_download"), false);
  });

  it("maps lifecycle steps to separated duties and withholds LICENSED", () => {
    assert.equal(permissionForTransition("DRAFT", "UPLOADING"), "title.advance_upload");
    assert.equal(permissionForTransition("QC_REVIEW", "RIGHTS_REVIEW"), "title.qc_review");
    assert.equal(
      permissionForTransition("RIGHTS_REVIEW", "LICENSING_READY"),
      "title.rights_review",
    );
    assert.equal(permissionForTransition("IN_NEGOTIATION", "LICENSED"), null);
  });

  it("reserves dashboard and super-admin grants for verified super admins", () => {
    assert.equal(canAccessDashboard(superAdmin()), true);
    assert.equal(canAccessDashboard(admin()), false);
    assert.equal(canAccessDashboard(qc), false);
    assert.equal(canAccessDashboard(legal), false);
    assert.equal(canAccessDashboard(finance), false);
    assert.equal(canAccessDashboard(viewer()), false);
    assert.equal(canGrantInternalRole(admin(), "viewer"), true);
    assert.equal(canGrantInternalRole(admin(), "super_admin"), false);
    assert.equal(canGrantInternalRole(superAdmin(), "super_admin"), true);
    assert.equal(
      canAccessDashboard(actor("super-u", "independent_creator", "super_admin", false)),
      false,
    );
    assert.equal(
      canGrantInternalRole(actor("admin-a", "independent_creator", "admin", false), "viewer"),
      false,
    );
  });

  it("routes operators away from the super-admin dashboard", () => {
    assert.equal(workspaceHome(creator()), "/creator");
    assert.equal(workspaceHome(studio()), "/studio");
    assert.equal(workspaceHome(buyer()), "/buyer");
    assert.equal(workspaceHome(superAdmin()), "/dashboard");
    assert.equal(workspaceHome(admin()), "/internal");
    assert.equal(workspaceHome(qc), "/internal");
  });
});

// Explicit CMS ingest never inherits creator permissions from a mixed account.
it("CMS ingest belongs only to verified super admins", () => {
  assert.equal(hasPermission(superAdmin(), "title.ingest_internal"), true);
  for (const a of [creator(), studio(), buyer(), admin(), viewer(), qc, legal, finance])
    assert.equal(hasPermission(a, "title.ingest_internal"), false);
});
