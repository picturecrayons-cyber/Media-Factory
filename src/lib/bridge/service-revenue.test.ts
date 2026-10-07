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
