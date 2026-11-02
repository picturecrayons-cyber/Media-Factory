import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { downloadDecision, matchesBuyerEntitlementScope } from "./delivery-policy.ts";

describe("master download denial", () => {
  it("never lets a buyer entitlement download a master", () => {
    const decision = downloadDecision({
      kind: "master",
      actorIsOwner: false,
      actorIsInternal: false,
      accountType: "buyer",
      hasLicenseEntitlement: true,
    });
    assert.equal(decision.allow, false);
    assert.match(decision.reason, /Master downloads are denied/);
  });

  it("never lets a buyer entitlement download a technical package", () => {
    const decision = downloadDecision({
      kind: "technical",
      actorIsOwner: false,
      actorIsInternal: false,
      accountType: "buyer",
      hasLicenseEntitlement: true,
    });
    assert.equal(decision.allow, false);
    assert.match(decision.reason, /does not authorize technical package downloads/);
  });

  it("allows master downloads for explicit Admin and Super Admin roles only", () => {
    for (const role of ["admin", "super_admin"]) {
      assert.equal(downloadDecision({
        kind: "master",
        actorIsOwner: false,
        actorIsInternal: true,
        actorInternalRole: role,
        accountType: "buyer",
        hasLicenseEntitlement: false,
      }).allow, true);
    }
  });

  it("denies QC and Legal master downloads even when the reviewer owns the title", () => {
    for (const role of ["qc_reviewer", "legal_reviewer"]) {
      const decision = downloadDecision({
        kind: "master",
        actorIsOwner: true,
        actorIsInternal: true,
        actorInternalRole: role,
        accountType: "independent_creator",
        hasLicenseEntitlement: true,
      });
      assert.equal(decision.allow, false);
      assert.match(decision.reason, /denied to QC \/ Legal reviewers/);
    }
  });

  it("lets the owner download a master and a buyer download only a screener", () => {
    assert.equal(downloadDecision({
      kind: "master",
      actorIsOwner: true,
      actorIsInternal: false,
      accountType: "studio",
      hasLicenseEntitlement: false,
    }).allow, true);
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


describe("Buyer entitlement scope", () => {
  const valid = {
    actorUserId: "buyer-a",
    actorOrganizationId: "org-a",
    titleId: "title-a",
    entitlementUserId: "buyer-a",
    entitlementOrganizationId: "org-a",
    entitlementTitleId: "title-a",
  };

  it("requires user, organization, and title to match simultaneously", () => {
    assert.equal(matchesBuyerEntitlementScope(valid), true);
    assert.equal(matchesBuyerEntitlementScope({ ...valid, entitlementUserId: "buyer-b" }), false);
    assert.equal(matchesBuyerEntitlementScope({ ...valid, entitlementOrganizationId: "org-b" }), false);
    assert.equal(matchesBuyerEntitlementScope({ ...valid, entitlementTitleId: "title-b" }), false);
  });

  it("fails closed when the entitlement record has no organization binding", () => {
    assert.equal(matchesBuyerEntitlementScope({ ...valid, entitlementOrganizationId: null }), false);
    assert.equal(matchesBuyerEntitlementScope({ ...valid, actorOrganizationId: null }), false);
  });
});
