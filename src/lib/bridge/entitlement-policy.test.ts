import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesBuyerEntitlementScope } from "./entitlement-policy.ts";

const expected = { userId: "buyer-a", organizationId: "org-a", titleId: "title-a" };

describe("buyer entitlement organization isolation", () => {
  it("requires user, organization, title, and license access type to match", () => {
    assert.equal(matchesBuyerEntitlementScope({ ...expected, accessType: "license" }, expected), true);
  });
  it("denies Buyer B from Buyer A organization entitlement", () => {
    assert.equal(matchesBuyerEntitlementScope({ ...expected, accessType: "license" }, { ...expected, userId: "buyer-b", organizationId: "org-b" }), false);
  });
  it("denies a matching user and title when organization differs", () => {
    assert.equal(matchesBuyerEntitlementScope({ ...expected, accessType: "license" }, { ...expected, organizationId: "org-b" }), false);
  });
  it("fails closed when organization scope is absent or legacy row has no organization", () => {
    assert.equal(matchesBuyerEntitlementScope({ ...expected, organizationId: null, accessType: "license" }, expected), false);
    assert.equal(matchesBuyerEntitlementScope({ ...expected, accessType: "license" }, { ...expected, organizationId: null }), false);
  });
  it("denies wrong title or non-license access", () => {
    assert.equal(matchesBuyerEntitlementScope({ ...expected, accessType: "license" }, { ...expected, titleId: "title-b" }), false);
    assert.equal(matchesBuyerEntitlementScope({ ...expected, accessType: "screener" }, expected), false);
  });
});