import test from "node:test";
import assert from "node:assert/strict";
import {
  SERVICE_PRICE_GUIDANCE,
  quoteTotalPaise,
  canDeliver,
  canMarkSignedOff,
  type VendorJob,
} from "./vendor-jobs.ts";

test("vendor price guidance is explicitly indicative and has market references", () => {
  assert.ok(SERVICE_PRICE_GUIDANCE.length >= 5);
  for (const item of SERVICE_PRICE_GUIDANCE) {
    assert.equal(item.priceBasis, "indicative_market_estimate");
    assert.ok(item.sourceUrl?.startsWith("https://"));
    if (item.minPaise != null && item.maxPaise != null) {
      assert.ok(item.maxPaise >= item.minPaise);
    }
  }
});

test("quote total uses integer paise with explicit fee and tax", () => {
  assert.equal(quoteTotalPaise(3_000_000, 300_000, 0), 3_300_000);
  assert.equal(quoteTotalPaise(3_000_000, 300_000, 594_000), 3_894_000);
  assert.throws(() => quoteTotalPaise(-1, 0, 0), /invalid_quote_amount/);
  assert.throws(() => quoteTotalPaise(1.5, 0, 0), /invalid_quote_amount/);
});

test("payment alone never marks a job delivered", () => {
  const base = {
    id: "job",
    type: "dcp_request",
    state: "paid",
    titleId: "title",
    note: "",
    serviceLane: "managed",
    scope: {},
    paymentStatus: "paid",
    indicativeMinPaise: null,
    indicativeMaxPaise: null,
    deliverableAssetKey: null,
    signoffAt: null,
  } as VendorJob;
  assert.equal(canDeliver(base), false);
  assert.equal(canMarkSignedOff(base, "reviewer"), false);
});

test("delivery requires delivered state, an attached artifact and sign-off", () => {
  const signed = {
    state: "delivered" as const,
    deliverableAssetKey: "private/job/master.mov",
    signoffAt: "2026-10-09T00:00:00.000Z",
  };
  assert.equal(canDeliver(signed), true);
  assert.equal(canDeliver({ ...signed, deliverableAssetKey: null }), false);
  assert.equal(canDeliver({ ...signed, signoffAt: null }), false);
});

test("sign-off requires paid processing and a deliverable", () => {
  assert.equal(canMarkSignedOff({
    state: "human_review",
    paymentStatus: "paid",
    deliverableAssetKey: "private/jobs/123/output.mov",
  }, "senior QC"), true);
  assert.equal(canMarkSignedOff({
    state: "human_review",
    paymentStatus: "unpaid",
    deliverableAssetKey: "private/jobs/123/output.mov",
  }, "senior QC"), false);
  assert.equal(canMarkSignedOff({
    state: "human_review",
    paymentStatus: "paid",
    deliverableAssetKey: null,
  }, "senior QC"), false);
  assert.equal(canMarkSignedOff({
    state: "requested",
    paymentStatus: "paid",
    deliverableAssetKey: "private/jobs/123/output.mov",
  }, "senior QC"), false);
});
