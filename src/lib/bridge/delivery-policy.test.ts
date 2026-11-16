import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { downloadDecision } from "./delivery-policy.ts";

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
    assert.match(decision.reason, /Buyer accounts cannot download/);
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
    assert.match(decision.reason, /Buyer accounts cannot download/);
  });

  it("does not let an internal-role Buyer download master, technical, or censor-certificate assets", () => {
    for (const kind of ["master", "technical", "censor_certificate"]) {
      const decision = downloadDecision({
        kind,
        actorIsOwner: false,
        actorIsInternal: true,
        accountType: "buyer",
        hasLicenseEntitlement: false,
      });
      assert.equal(decision.allow, false, `unexpected Buyer access to ${kind}`);
      assert.match(decision.reason, /Buyer accounts cannot download/);
    }
  });

  it("lets an authorized non-Buyer owner download a master and a Buyer download only an entitled screener", () => {
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
