import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessBuyerRevenueReadiness, type BuyerRevenueOperationsRecord } from "./buyer-revenue-ops.ts";

const base: BuyerRevenueOperationsRecord = {
  buyerId: "buyer-1",
  buyerName: "Example Buyer",
  channel: "Amazon Prime Video",
  accountStatus: "VERIFIED",
  accountEvidenceReference: "account-review:case-100",
  accountVerifiedAt: "2026-11-10T10:00:00.000Z",
  territories: [{
    territory: "US",
    status: "VERIFIED_AVAILABLE",
    evidenceReference: "provider-avails:US-2026-11",
    verifiedAt: "2026-11-10T10:00:00.000Z",
  }],
  demandStatus: "EVALUATION",
  demandEvidenceReference: "mail-thread:amazon-123",
  demandReceivedAt: "2026-11-10T10:00:00.000Z",
  contractStatus: "SIGNED",
  contractEvidenceReference: "contracts/amazon/title-1/signed.pdf",
  contractSignedAt: "2026-11-10T10:00:00.000Z",
  paymentStatus: "SETTLED",
  paymentAmountMinor: 125000,
  paymentCurrency: "USD",
  paymentReference: "bank-settlement:abc123",
  paymentReconciledAt: "2026-11-10T10:00:00.000Z",
  payeeStatus: "VERIFIED",
  payeeEvidenceReference: "finance-review:payee-1",
};

describe("Buyer & Revenue Operations evidence gates", () => {
  it("classifies cash received only when payment and payee are evidenced and reconciled", () => {
    const result = assessBuyerRevenueReadiness(base);
    assert.equal(result.accountVerified, true);
    assert.deepEqual(result.verifiedTerritories, ["US"]);
    assert.equal(result.demandConfirmed, true);
    assert.equal(result.contractEffective, true);
    assert.equal(result.paymentSettled, true);
    assert.equal(result.payeeVerified, true);
    assert.equal(result.revenueClassification, "CASH_RECEIVED");
    assert.deepEqual(result.blockers, []);
  });

  it("does not trust VERIFIED account status without evidence and timestamp", () => {
    const result = assessBuyerRevenueReadiness({
      ...base,
      accountEvidenceReference: null,
      accountVerifiedAt: null,
    });
    assert.equal(result.accountVerified, false);
    assert.ok(result.blockers.includes("BUYER_ACCOUNT_NOT_VERIFIED"));
  });

  it("does not infer territory access from a consumer service being available", () => {
    const result = assessBuyerRevenueReadiness({
      ...base,
      territories: [{
        territory: "IN",
        status: "UNCONFIRMED",
        evidenceReference: null,
        verifiedAt: null,
      }],
    });
    assert.deepEqual(result.verifiedTerritories, []);
    assert.ok(result.blockers.includes("NO_VERIFIED_TERRITORY"));
  });

  it("does not treat discovery or generic outreach as confirmed demand", () => {
    const result = assessBuyerRevenueReadiness({
      ...base,
      demandStatus: "DISCOVERY",
      demandEvidenceReference: null,
      demandReceivedAt: null,
      contractStatus: "NONE",
      contractEvidenceReference: null,
      contractSignedAt: null,
      paymentStatus: "NONE",
      paymentAmountMinor: null,
      paymentCurrency: null,
      paymentReference: null,
      paymentReconciledAt: null,
    });
    assert.equal(result.demandConfirmed, false);
    assert.equal(result.contractEffective, false);
    assert.equal(result.paymentSettled, false);
    assert.equal(result.revenueClassification, "NO_REVENUE");
    assert.ok(result.blockers.includes("NO_EVIDENCED_BUYER_DEMAND"));
  });

  it("does not treat a draft or unsigned contract as contracted revenue", () => {
    const result = assessBuyerRevenueReadiness({
      ...base,
      contractStatus: "SENT",
      contractEvidenceReference: null,
      contractSignedAt: null,
    });
    assert.equal(result.contractEffective, false);
    assert.equal(result.revenueClassification, "PIPELINE_ONLY");
  });

  it("does not treat an invoice or payment intent as cash received", () => {
    const result = assessBuyerRevenueReadiness({
      ...base,
      paymentStatus: "INVOICED",
      paymentAmountMinor: 0,
      paymentReference: null,
      paymentReconciledAt: null,
    });
    assert.equal(result.paymentSettled, false);
    assert.equal(result.revenueClassification, "INVOICED");
    assert.ok(result.blockers.includes("CASH_NOT_RECONCILED"));
  });

  it("keeps payee eligibility separate from a buyer payment status", () => {
    const result = assessBuyerRevenueReadiness({
      ...base,
      payeeStatus: "PENDING",
      payeeEvidenceReference: null,
    });
    assert.equal(result.paymentSettled, true);
    assert.equal(result.payeeVerified, false);
    assert.notEqual(result.revenueClassification, "CASH_RECEIVED");
  });

  it("does not count invalid money or invalid timestamps as settlement evidence", () => {
    const result = assessBuyerRevenueReadiness({
      ...base,
      paymentAmountMinor: Number.NaN,
      paymentReconciledAt: "not-a-date",
    });
    assert.equal(result.paymentSettled, false);
    assert.notEqual(result.revenueClassification, "CASH_RECEIVED");
  });
});
