import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { downloadDecision } from "./delivery-policy.ts";
import { hasStaffPermission, type Actor } from "./rbac.ts";

describe("Bridge asset download policy", () => {
  it("denies QC and Legal master downloads by default", () => {
    for (const actorInternalRole of ["qc_reviewer", "legal_reviewer"]) {
      const decision = downloadDecision({
        kind: "master",
        actorIsOwner: false,
        actorIsInternal: true,
        actorInternalRole,
        accountType: "independent_creator",
        hasLicenseEntitlement: false,
      });
      assert.equal(decision.allow, false);
      assert.match(decision.reason, /separately approved exception/);
    }
  });

  it("preserves master downloads for Admin and Super Admin", () => {
    for (const actorInternalRole of ["admin", "super_admin"]) {
      const decision = downloadDecision({
        kind: "master",
        actorIsOwner: false,
        actorIsInternal: true,
        actorInternalRole,
        accountType: "independent_creator",
        hasLicenseEntitlement: false,
      });
      assert.equal(decision.allow, true);
    }
  });

  it("preserves the title owner's master download", () => {
    assert.equal(downloadDecision({
      kind: "master",
      actorIsOwner: true,
      actorIsInternal: false,
      accountType: "studio",
      hasLicenseEntitlement: false,
    }).allow, true);
  });

  it("keeps QC and Legal access to non-master internal review assets", () => {
    for (const actorInternalRole of ["qc_reviewer", "legal_reviewer"]) {
      for (const kind of ["screener", "subtitle", "technical", "poster"]) {
        const decision = downloadDecision({
          kind,
          actorIsOwner: false,
          actorIsInternal: true,
          actorInternalRole,
          accountType: "independent_creator",
          hasLicenseEntitlement: false,
        });
        assert.equal(decision.allow, true, `${actorInternalRole} should retain ${kind} access`);
      }
    }
  });

  it("never lets a buyer entitlement download a master or technical package", () => {
    for (const kind of ["master", "technical"]) {
      const decision = downloadDecision({
        kind,
        actorIsOwner: false,
        actorIsInternal: false,
        accountType: "buyer",
        hasLicenseEntitlement: true,
      });
      assert.equal(decision.allow, false);
    }
  });

  it("allows a buyer screener only with a license entitlement", () => {
    assert.equal(downloadDecision({
      kind: "screener",
      actorIsOwner: false,
      actorIsInternal: false,
      accountType: "buyer",
      hasLicenseEntitlement: true,
    }).allow, true);
    assert.equal(downloadDecision({
      kind: "screener",
      actorIsOwner: false,
      actorIsInternal: false,
      accountType: "buyer",
      hasLicenseEntitlement: false,
    }).allow, false);
  });
});


test("staff download bypass is derived from the explicit asset.sign_download permission", () => {
  const qc: Actor = {
    userId: "qc-user",
    emailVerified: true,
    accountType: "independent_creator",
    internalRole: "qc_reviewer",
    organizationId: null,
  };
  const viewer: Actor = {
    ...qc,
    userId: "viewer-user",
    internalRole: "viewer",
  };
  assert.equal(hasStaffPermission(qc, "asset.sign_download"), true);
  assert.equal(hasStaffPermission(viewer, "asset.sign_download"), false);
  assert.equal(downloadDecision({
    kind: "master",
    actorIsOwner: false,
    actorIsInternal: hasStaffPermission(viewer, "asset.sign_download"),
    actorInternalRole: viewer.internalRole,
    accountType: viewer.accountType,
    hasLicenseEntitlement: false,
  }).allow, false);
});
