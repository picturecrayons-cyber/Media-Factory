import assert from "node:assert/strict";
import test from "node:test";
import {
  buyerStageNotificationDedupeKey,
  canAccessBuyerProspect,
  canAdvanceBuyerProspectStage,
  recipientsMatchProspectContact,
} from "./communications-policy.ts";

test("buyer prospect scope denies cross-organization access", () => {
  assert.equal(canAccessBuyerProspect("admin", "Studio A", "Studio A"), true);
  assert.equal(canAccessBuyerProspect("admin", "Studio A", "Studio B"), false);
  assert.equal(canAccessBuyerProspect("admin", null, null), false);
  assert.equal(canAccessBuyerProspect("super_admin", null, "Studio B"), true);
});

test("buyer pipeline only permits declared stage transitions", () => {
  assert.equal(canAdvanceBuyerProspectStage("DISCOVERED", "RESEARCHING"), true);
  assert.equal(canAdvanceBuyerProspectStage("DISCOVERED", "CONTRACTED"), false);
  assert.equal(canAdvanceBuyerProspectStage("CONTRACTED", "RESEARCHING"), false);
});

test("notification dedupe key is stable for the same transition", () => {
  const first = buyerStageNotificationDedupeKey("prospect-1", "ENQUIRY", "IN_NEGOTIATION");
  const retry = buyerStageNotificationDedupeKey("prospect-1", "ENQUIRY", "IN_NEGOTIATION");
  const other = buyerStageNotificationDedupeKey("prospect-1", "IN_NEGOTIATION", "CONTRACT_REVIEW");
  assert.equal(first, retry);
  assert.notEqual(first, other);
});

test("outbound recipients must match the linked prospect contact", () => {
  assert.equal(recipientsMatchProspectContact(["buyer@example.com"], "Buyer@Example.com"), true);
  assert.equal(recipientsMatchProspectContact(["buyer@example.com", "other@example.com"], "buyer@example.com"), false);
  assert.equal(recipientsMatchProspectContact(["buyer@example.com"], null), false);
});
