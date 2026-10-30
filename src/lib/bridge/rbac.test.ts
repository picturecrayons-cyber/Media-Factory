import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPermission, canAccessDashboard, canAccessTitleWorkspace, canGrantInternalRole, canMutateTitle, canOperateOnTitle, canReadTitle, hasPermission, hasStaffPermission, permissionForTransition, workspaceHome } from "./rbac.ts";
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
const investor = () => actor("investor-a", "investor");
const admin = () => actor("admin-a", "independent_creator", "admin");
const superAdmin = () => actor("super-a", "independent_creator", "super_admin");
const viewer = () => actor("viewer-a", "independent_creator", "viewer");
const qc = actor("qc1", "independent_creator", "qc_reviewer");
const legal = actor("legal1", "independent_creator", "legal_reviewer");
const finance = actor("finance1", "independent_creator", "finance");

describe("PRD authorization matrix", () => {
  it("enforces the complete account-type and internal-role permission matrix", () => {
    const expected: Array<[Actor, readonly string[]]> = [
      [creator(), ["title.create", "title.read_own", "title.update_own", "title.advance_upload", "service.quote_create", "service.order_create", "asset.sign_upload", "asset.sign_download", "entitlement.read_own", "delivery.read", "delivery.read_finance"]],
      [studio(), ["title.create", "title.read_own", "title.update_own", "title.advance_upload", "service.quote_create", "service.order_create", "asset.sign_upload", "asset.sign_download", "entitlement.read_own", "delivery.read", "delivery.read_finance"]],
      [buyer(), ["title.read_catalog", "payment.create_order", "entitlement.read_own", "asset.sign_download"]],
      [investor(), ["entitlement.read_own"]],
      [viewer(), ["title.read_catalog", "audit.read"]],
      [qc, ["title.read_catalog", "title.qc_review", "asset.sign_download", "audit.read"]],
      [legal, ["title.read_catalog", "title.rights_review", "asset.sign_download", "audit.read"]],
      [finance, ["title.read_catalog", "finance.read", "finance.record_settlement", "entitlement.read_own", "audit.read"]],
      [admin(), ["title.read_catalog", "service.quote_create", "service.order_create", "service.fulfill", "title.qc_review", "title.rights_review", "title.license", "title.merge_duplicate", "title.negotiate", "title.deliver", "delivery.read", "delivery.read_finance", "asset.sign_download", "finance.read", "finance.record_settlement", "users.invite_internal", "audit.read", "loop.publish", "loop.revoke", "loop.certify_playback"]],
      [superAdmin(), ["title.ingest_internal", "title.create", "title.read_catalog", "title.advance_upload", "title.qc_review", "title.rights_review", "title.license", "title.negotiate", "title.deliver", "delivery.read", "delivery.read_finance", "asset.sign_download", "entitlement.read_own", "finance.read", "finance.record_settlement", "users.invite_internal", "audit.read", "loop.publish", "loop.revoke", "loop.certify_playback", "asset.sign_upload"]],
    ];
    const all = [
      "title.ingest_internal", "title.create", "title.read_own", "title.read_catalog", "title.update_own",
      "title.merge_duplicate", "title.advance_upload", "title.qc_review", "title.rights_review",
      "title.license", "title.negotiate", "title.deliver", "asset.sign_upload", "asset.sign_download",
      "payment.create_order", "service.quote_create", "service.order_create", "service.fulfill",
      "entitlement.read_own", "finance.read", "finance.configure", "finance.record_settlement",
      "delivery.read", "delivery.read_finance", "users.invite_internal", "audit.read",
      "loop.publish", "loop.revoke", "loop.certify_playback",
    ] as const;
    for (const [who, allowed] of expected) {
      for (const permission of all) {
        assert.equal(hasPermission(who, permission), allowed.includes(permission), `${who.internalRole ?? who.accountType} permission mismatch: ${permission}`);
      }
    }
  });

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

  it("admin receives only explicit staff permissions, not account-type mutation powers", () => {
    const a = admin();
    assert.equal(hasPermission(a, "title.read_catalog"), true);
    assert.equal(hasPermission(a, "title.qc_review"), true);
    assert.equal(hasPermission(a, "users.invite_internal"), true);
    assert.equal(hasPermission(a, "title.create"), false);
    assert.equal(hasPermission(a, "title.update_own"), false);
    assert.equal(hasPermission(a, "title.advance_upload"), false);
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

  it("super admin can create canonical Bridge titles and use explicit internal upload powers", () => {
    const a = superAdmin();
    assert.equal(hasPermission(a, "title.create"), true);
    assert.equal(hasPermission(a, "asset.sign_upload"), true);
    assert.equal(hasPermission(a, "users.invite_internal"), true);
    assert.equal(hasPermission(a, "title.license"), true);
  });

  it("viewer, reviewer and finance roles cannot inherit creator mutation powers from account type", () => {
    for (const role of ["viewer", "qc_reviewer", "legal_reviewer", "finance"] as const) {
      const mixed = actor(`mixed-${role}`, "independent_creator", role);
      for (const permission of ["title.create", "title.update_own", "title.advance_upload", "asset.sign_upload"] as const) {
        assert.equal(hasPermission(mixed, permission), false, `${role} unexpectedly received ${permission}`);
      }
    }
  });

  it("ordinary admins cannot grant super admin while super admin has an explicit grant matrix", () => {
    assert.equal(canGrantInternalRole(admin(), "viewer"), true);
    assert.equal(canGrantInternalRole(admin(), "admin"), true);
    assert.equal(canGrantInternalRole(admin(), "super_admin"), false);
    assert.equal(canGrantInternalRole(superAdmin(), "super_admin"), true);
    assert.equal(canGrantInternalRole(qc, "viewer"), false);
    assert.equal(canGrantInternalRole(actor("unverified", "independent_creator", "admin", false), "viewer"), false);
  });

  it("cross-title staff capability must come from an explicit staff permission", () => {
    assert.equal(hasStaffPermission(actor("viewer-a", "independent_creator", "viewer"), "asset.sign_upload"), false);
    assert.equal(hasStaffPermission(admin(), "asset.sign_upload"), false);
    assert.equal(hasStaffPermission(superAdmin(), "asset.sign_upload"), true);
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

  it("restricts the shared title workspace to creators, studios, and catalog-authorized staff", () => {
    assert.equal(canAccessTitleWorkspace(creator()), true);
    assert.equal(canAccessTitleWorkspace(studio()), true);
    assert.equal(canAccessTitleWorkspace(buyer()), false);
    assert.equal(canAccessTitleWorkspace(investor()), false);
    assert.equal(canAccessTitleWorkspace(viewer()), true);
    assert.equal(canAccessTitleWorkspace(actor("unverified", "studio", null, false)), false);
  });

  it("shares title access only with verified Studio accounts in the same Studio organization", () => {
    const member: Actor = {
      ...actor("studio-member", "studio"),
      organizationId: "11111111-1111-4111-8111-111111111111",
    };
    const sameOrgTitle = {
      ownerUserId: "studio-owner",
      ownerAccountType: "studio" as const,
      ownerOrganizationId: "11111111-1111-4111-8111-111111111111",
      status: "DRAFT" as const,
    };
    const otherOrgTitle = {
      ...sameOrgTitle,
      ownerOrganizationId: "22222222-2222-4222-8222-222222222222",
    };
    const creatorOwnedSameName = {
      ...sameOrgTitle,
      ownerAccountType: "independent_creator" as const,
    };
    assert.equal(canReadTitle(member, sameOrgTitle), true);
    assert.equal(canMutateTitle(member, sameOrgTitle, "title.update_own", "title.license"), true);
    assert.equal(canOperateOnTitle(member, sameOrgTitle, "asset.sign_upload"), true);
    assert.equal(canReadTitle(member, otherOrgTitle), false);
    assert.equal(canMutateTitle(member, otherOrgTitle, "title.update_own", "title.license"), false);
    assert.equal(canOperateOnTitle(member, otherOrgTitle, "asset.sign_upload"), false);
    assert.equal(canReadTitle({ ...member, organizationId: null }, sameOrgTitle), false);
    assert.equal(canReadTitle({ ...member, emailVerified: false }, sameOrgTitle), false);
    assert.equal(canReadTitle({ ...member, accountType: "buyer" }, sameOrgTitle), false);
    assert.equal(canReadTitle(member, creatorOwnedSameName), false);
  });

  it("routes operators away from the super-admin dashboard", () => {
    assert.equal(workspaceHome(creator()), "/creator");
    assert.equal(workspaceHome(studio()), "/studio");
    assert.equal(workspaceHome(buyer()), "/buyer");
    assert.equal(workspaceHome(investor()), "/investor");
    assert.equal(workspaceHome(superAdmin()), "/dashboard");
    assert.equal(workspaceHome(admin()), "/internal");
    assert.equal(workspaceHome(qc), "/internal?desk=qc");
  });
});

// Explicit CMS ingest never inherits creator permissions from a mixed account.
it("CMS ingest belongs only to verified super admins", () => {
  assert.equal(hasPermission(superAdmin(), "title.ingest_internal"), true);
  for (const a of [creator(), studio(), buyer(), admin(), viewer(), qc, legal, finance])
    assert.equal(hasPermission(a, "title.ingest_internal"), false);
});
