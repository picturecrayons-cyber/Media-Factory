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
    assert.match(decision.reason, /does not authorize a master/);
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
