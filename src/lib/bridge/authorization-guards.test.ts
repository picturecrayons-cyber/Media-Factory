import assert from "node:assert/strict";
import test from "node:test";
import { assertBuyerDeliveryBlocked } from "./authorization-guards";

test("ordinary Buyer cannot receive a signed URL from legacy user-only entitlements", () => {
  assert.throws(
    () => assertBuyerDeliveryBlocked({ userId: "buyer-a", accountType: "buyer", organizationId: "org-a" }),
    /BRIDGE_BUYER_DELIVERY_BLOCKED/,
  );
});

test("Buyer with no resolved organization remains blocked", () => {
  assert.throws(
    () => assertBuyerDeliveryBlocked({ userId: "buyer-a", accountType: "buyer", organizationId: null }),
    /BRIDGE_BUYER_DELIVERY_BLOCKED/,
  );
});

test("internal reviewer with buyer account is not treated as an external Buyer", () => {
  assert.doesNotThrow(
    () => assertBuyerDeliveryBlocked({ userId: "staff-1", accountType: "buyer", internalRole: "legal_reviewer" }),
  );
});

test("non-Buyer title owners are not blocked by the Buyer delivery gate", () => {
  assert.doesNotThrow(
    () => assertBuyerDeliveryBlocked({ userId: "studio-1", accountType: "studio", organizationId: "org-studio" }),
  );
});
