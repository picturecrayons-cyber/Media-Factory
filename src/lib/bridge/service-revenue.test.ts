import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateServiceLine,
  calculateRefundSplit,
  calculateNetProfit,
} from "./commercial-math.ts";

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


test("customer service quote DTO excludes internal costing, margin and internal-only lines", () => {
  const result = toCustomerServiceQuote({
    quoteId: "quote-1",
    quoteNumber: "CRQ-20261110-TEST",
    status: "QUOTED",
    currency: "INR",
    subtotalPaise: 12000,
    taxPaise: 2160,
    totalPaise: 14160,
    estimatedCostPaise: 7000,
    estimatedMarginPaise: 5000,
    detectedAssets: [],
    requiredWork: [],
    lines: [
      {
        serviceCode: "ENCODE",
        classification: "BILLABLE",
        pricingMethod: "PER_ASSET",
        unitLabel: "asset",
        quantity: 1,
        unitPricePaise: 12000,
        lineTotalPaise: 12000,
        rateId: "internal-rate-id",
        rateVersion: 7,
        costBasisPaise: 7000,
        estimatedMarginPaise: 5000,
        evidence: { source: "verified" },
      },
      {
        serviceCode: "INCLUDED_QC",
        classification: "INCLUDED",
        pricingMethod: "PER_ASSET",
        unitLabel: "asset",
        quantity: 1,
        unitPricePaise: 500,
        lineTotalPaise: 500,
        rateId: "internal-rate-id-2",
        rateVersion: 2,
        costBasisPaise: 300,
        estimatedMarginPaise: 200,
        evidence: { source: "verified" },
      },
      {
        serviceCode: "INTERNAL_DIT",
        classification: "INTERNAL",
        pricingMethod: "PER_HOUR",
        unitLabel: "hour",
        quantity: 2,
        unitPricePaise: 9000,
        lineTotalPaise: 18000,
        rateId: "internal-rate-id-3",
        rateVersion: 1,
        costBasisPaise: 12000,
        estimatedMarginPaise: 6000,
        evidence: { source: "internal" },
      },
    ],
  });

  assert.equal("estimatedCostPaise" in result, false);
  assert.equal("estimatedMarginPaise" in result, false);
  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.lines[0], {
    serviceCode: "ENCODE",
    classification: "BILLABLE",
    pricingMethod: "PER_ASSET",
    unitLabel: "asset",
    quantity: 1,
    unitPricePaise: 12000,
    lineTotalPaise: 12000,
    evidence: { source: "verified" },
  });
  assert.equal(result.lines[1].unitPricePaise, 0);
  assert.equal(result.lines[1].lineTotalPaise, 0);
  for (const line of result.lines) {
    assert.equal("costBasisPaise" in line, false);
    assert.equal("estimatedMarginPaise" in line, false);
    assert.equal("rateId" in line, false);
    assert.equal("rateVersion" in line, false);
  }
});
