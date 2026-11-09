export type ServiceQuoteLine = {
  serviceCode: string;
  rateId: string;
  rateVersion: number;
  classification: "BILLABLE" | "INCLUDED" | "INTERNAL" | "PASS_THROUGH";
  pricingMethod: string;
  unitLabel: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  costBasisPaise: number;
  estimatedMarginPaise: number;
  evidence: unknown;
};

export type ServiceQuote = {
  quoteId: string;
  quoteNumber: string;
  status: "QUOTED";
  currency: "INR";
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  estimatedCostPaise: number;
  estimatedMarginPaise: number;
  detectedAssets: unknown;
  requiredWork: unknown;
  lines: ServiceQuoteLine[];
};

function customerLine(line: ServiceQuoteLine) {
  return {
    serviceCode: line.serviceCode,
    classification: line.classification,
    pricingMethod: line.pricingMethod,
    unitLabel: line.unitLabel,
    quantity: line.quantity,
    unitPricePaise: line.unitPricePaise,
    lineTotalPaise: line.lineTotalPaise,
  };
}

/**
 * External Creator/Studio quote responses expose customer pricing only.
 * Internal cost, margin, and rate internals require the explicit finance.read permission.
 */
export function toServiceQuoteResponse(quote: ServiceQuote, includeInternalFinancials: boolean) {
  const common = {
    quoteId: quote.quoteId,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    currency: quote.currency,
    subtotalPaise: quote.subtotalPaise,
    taxPaise: quote.taxPaise,
    totalPaise: quote.totalPaise,
    detectedAssets: quote.detectedAssets,
    requiredWork: quote.requiredWork,
  };

  if (!includeInternalFinancials) {
    return {
      ...common,
      lines: quote.lines.filter((line) => line.classification !== "INTERNAL").map(customerLine),
    };
  }

  return {
    ...common,
    estimatedCostPaise: quote.estimatedCostPaise,
    estimatedMarginPaise: quote.estimatedMarginPaise,
    lines: quote.lines,
  };
}
