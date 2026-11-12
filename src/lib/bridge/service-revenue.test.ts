import test from "node:test";
import assert from "node:assert/strict";
import type { Actor } from "./rbac.ts";
import { presentServiceQuote } from "./service-quote-view.ts";
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

const creatorActor: Actor = {
  userId: "creator-1",
  emailVerified: true,
  accountType: "independent_creator",
  internalRole: null,
};
const creatorAdminActor: Actor = {
  ...creatorActor,
  internalRole: "admin",
};
const sampleQuote = {
  quoteId: "quote-1",
  subtotalPaise: 10000,
  taxPaise: 1800,
  totalPaise: 11800,
  estimatedCostPaise: 6200,
  estimatedMarginPaise: 3800,
  lines: [{
    serviceCode: "DIT",
    lineTotalPaise: 10000,
    costBasisPaise: 6200,
    estimatedMarginPaise: 3800,
  }],
};

test("customer quote response omits internal cost and margin at quote and line level", () => {
  const view = presentServiceQuote(creatorActor, sampleQuote);
  assert.equal("estimatedCostPaise" in view, false);
  assert.equal("estimatedMarginPaise" in view, false);
  assert.equal("costBasisPaise" in view.lines[0], false);
  assert.equal("estimatedMarginPaise" in view.lines[0], false);
  assert.equal(view.totalPaise, 11800);
});

test("explicit finance staff permission can view internal quote economics", () => {
  const view = presentServiceQuote(creatorAdminActor, sampleQuote);
  assert.equal("estimatedCostPaise" in view ? view.estimatedCostPaise : undefined, 6200);
  assert.equal("estimatedMarginPaise" in view ? view.estimatedMarginPaise : undefined, 3800);
  assert.equal("costBasisPaise" in view.lines[0] ? view.lines[0].costBasisPaise : undefined, 6200);
});
