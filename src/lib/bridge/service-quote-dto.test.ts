import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { toCustomerServiceQuoteDto } from "./service-quote-dto.ts";

test("customer quote DTO exposes prices but strips internal cost, margin and rate metadata", () => {
  const internalLine = {
    serviceName: "Malayalam subtitle QC",
    unitLabel: "language",
    quantity: 1,
    unitPricePaise: 5000,
    lineTotalPaise: 5000,
    rateId: "internal-rate-id",
    rateVersion: 9,
    classification: "INTERNAL",
    costBasisPaise: 1200,
    estimatedMarginPaise: 3800,
    evidence: {
      internalNote: "not customer-facing",
      nested: { costBasisPaise: 1200, estimatedMarginPaise: 3800 },
    },
    supplierRate: { hourlyRatePaise: 9000 },
    pricingSnapshot: {
      costBasisPaise: 1200,
      rateId: "nested-internal-rate",
      classification: "INTERNAL",
    },
  };
  const dto = toCustomerServiceQuoteDto({
    quoteId: "quote-1",
    quoteNumber: "CRQ-20261103-ABCD",
    status: "QUOTED",
    currency: "INR",
    subtotalPaise: 5000,
    taxPaise: 900,
    totalPaise: 5900,
    lines: [internalLine],
    // Structural typing permits extra runtime properties; the mapper must
    // still serialize only its explicit customer-facing allowlist.
    estimatedCostPaise: 1200,
    estimatedMarginPaise: 3800,
    internalCostBreakdown: {
      dailyManpowerCostPaise: 50000,
      overtimeRatePaise: 7000,
    },
  });

  assert.deepEqual(dto, {
    quoteId: "quote-1",
    quoteNumber: "CRQ-20261103-ABCD",
    status: "QUOTED",
    currency: "INR",
    subtotalPaise: 5000,
    taxPaise: 900,
    totalPaise: 5900,
    lines: [{
      serviceName: "Malayalam subtitle QC",
      unitLabel: "language",
      quantity: 1,
      unitPricePaise: 5000,
      lineTotalPaise: 5000,
    }],
  });
  assert.doesNotMatch(
    JSON.stringify(dto),
    /costBasis|estimatedCost|estimatedMargin|dailyManpower|overtimeRate|supplierRate|rateId|classification|evidence|internalNote|pricingSnapshot|internalCostBreakdown/i,
  );
});

test("createServiceQuote serializes only through the customer DTO allowlist", () => {
  const source = readFileSync(new URL("./service-revenue.ts", import.meta.url), "utf8");
  const start = source.indexOf("return toCustomerServiceQuoteDto({");
  assert.notEqual(start, -1, "createServiceQuote must return the allowlisted DTO");
  const end = source.indexOf("\n    });", start);
  assert.notEqual(end, -1, "customer DTO response block must close");
  const response = source.slice(start, end);
  assert.doesNotMatch(response, /estimatedCostPaise|estimatedMarginPaise|costBasisPaise|rateId|rateVersion|classification|evidence|detectedAssets|requiredWork/);
});
test("customer-facing services catalogue never exposes internal DIT cost inputs", () => {
  const source = readFileSync(new URL("../../routes/services.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /₹\s*(?:210|2,000|2,500)|Internal planning inputs|costBasisPaise|estimatedCostPaise|estimatedMarginPaise/);
  assert.match(source, /Custom quote based on approved DIT headcount, service duration and media scope/);
});
