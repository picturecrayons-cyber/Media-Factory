import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateServiceLine,
  calculateRefundSplit,
  calculateNetProfit,
} from "./commercial-math.ts";
import { toServiceQuoteResponse } from "./service-quote-response.ts";

test("service line respects quantity and minimum", () => {
  assert.deepEqual(
    calculateServiceLine({
      unitPricePaise: 1000,
      minimumPricePaise: 2500,
      quantity: 2,
      costBasisPaise: 300,
    }),
    {
      lineTotalPaise: 2500,
      costPaise: 600,
      estimatedMarginPaise: 1900,
    },
  );
});

test("refund split proportionally separates tax from customer refund", () => {
  assert.deepEqual(
    calculateRefundSplit({
      refundTotalPaise: 2950,
      invoiceSubtotalPaise: 5000,
      invoiceTaxPaise: 900,
      invoiceTotalPaise: 5900,
    }),
    {
      refundRevenuePaise: 2500,
      refundTaxPaise: 450,
    },
  );
});

test("net profit follows Bridge commercial formula", () => {
  assert.equal(
    calculateNetProfit({
      revenuePaise: 100000,
      refundsPaise: 5000,
      taxPaise: 18000,
      paymentFeesPaise: 2000,
      operatingCostsPaise: 25000,
      passThroughCostsPaise: 3000,
      settlementsPaise: 10000,
    }),
    37000,
  );
});


test("customer quote response excludes internal cost, margin, and rate internals", () => {
  const quote = {
    quoteId: "quote-1",
    quoteNumber: "CRQ-20261109-ABCD",
    status: "QUOTED" as const,
    currency: "INR" as const,
    subtotalPaise: 10000,
    taxPaise: 1800,
    totalPaise: 11800,
    estimatedCostPaise: 6000,
    estimatedMarginPaise: 4000,
    detectedAssets: [],
    requiredWork: [],
    lines: [{
      serviceCode: "SUBTITLE",
      rateId: "rate-secret",
      rateVersion: 7,
      classification: "BILLABLE" as const,
      pricingMethod: "PER_LANGUAGE",
      unitLabel: "language",
      quantity: 1,
      unitPricePaise: 10000,
      lineTotalPaise: 10000,
      costBasisPaise: 6000,
      estimatedMarginPaise: 4000,
      evidence: { serviceCode: "SUBTITLE", reason: "missing subtitle", quantity: 1 },
    }, {
      serviceCode: "INTERNAL_QC",
      rateId: "internal-rate",
      rateVersion: 1,
      classification: "INTERNAL" as const,
      pricingMethod: "FIXED",
      unitLabel: "job",
      quantity: 1,
      unitPricePaise: 0,
      lineTotalPaise: 0,
      costBasisPaise: 1200,
      estimatedMarginPaise: 0,
      evidence: { serviceCode: "INTERNAL_QC", reason: "internal-only service line", quantity: 1 },
    }],
  };
  const response = toServiceQuoteResponse(quote, false);
  assert.equal("estimatedCostPaise" in response, false);
  assert.equal("estimatedMarginPaise" in response, false);
  assert.equal("costBasisPaise" in response.lines[0], false);
  assert.equal("estimatedMarginPaise" in response.lines[0], false);
  assert.equal("rateId" in response.lines[0], false);
  assert.equal("evidence" in response.lines[0], false);
  assert.equal(response.lines.length, 1);
  assert.equal(response.lines.some((line) => line.serviceCode === "INTERNAL_QC"), false);
  assert.equal(response.totalPaise, 11800);
});

test("finance-authorized quote response retains internal financial detail", () => {
  const quote = {
    quoteId: "quote-2",
    quoteNumber: "CRQ-20261109-EFGH",
    status: "QUOTED" as const,
    currency: "INR" as const,
    subtotalPaise: 10000,
    taxPaise: 1800,
    totalPaise: 11800,
    estimatedCostPaise: 6000,
    estimatedMarginPaise: 4000,
    detectedAssets: [],
    requiredWork: [],
    lines: [{
      serviceCode: "SUBTITLE",
      rateId: "rate-internal",
      rateVersion: 7,
      classification: "BILLABLE" as const,
      pricingMethod: "PER_LANGUAGE",
      unitLabel: "language",
      quantity: 1,
      unitPricePaise: 10000,
      lineTotalPaise: 10000,
      costBasisPaise: 6000,
      estimatedMarginPaise: 4000,
      evidence: { serviceCode: "SUBTITLE", reason: "reviewed", quantity: 1 },
    }, {
      serviceCode: "INTERNAL_QC",
      rateId: "internal-rate",
      rateVersion: 1,
      classification: "INTERNAL" as const,
      pricingMethod: "FIXED",
      unitLabel: "job",
      quantity: 1,
      unitPricePaise: 0,
      lineTotalPaise: 0,
      costBasisPaise: 1200,
      estimatedMarginPaise: 0,
      evidence: { serviceCode: "INTERNAL_QC", reason: "internal-only service line", quantity: 1 },
    }],
  };
  const response = toServiceQuoteResponse(quote, true);
  assert.equal("estimatedCostPaise" in response ? response.estimatedCostPaise : null, 6000);
  assert.equal("estimatedMarginPaise" in response ? response.estimatedMarginPaise : null, 4000);
  assert.equal("costBasisPaise" in response.lines[0] ? response.lines[0].costBasisPaise : null, 6000);
  assert.equal(response.lines.some((line) => line.serviceCode === "INTERNAL_QC"), true);
});
