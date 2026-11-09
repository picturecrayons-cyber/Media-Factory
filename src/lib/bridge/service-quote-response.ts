import type { DetectedAsset, RequiredWork } from "./service-pricing";

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
  evidence: RequiredWork;
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
  detectedAssets: DetectedAsset[];
  requiredWork: RequiredWork[];
  lines: ServiceQuoteLine[];
};

type InternalQuoteLineFields = Pick<
  ServiceQuoteLine,
  "rateId" | "rateVersion" | "costBasisPaise" | "estimatedMarginPaise" | "evidence"
>;

type InternalQuoteFields = Pick<
  ServiceQuote,
  "estimatedCostPaise" | "estimatedMarginPaise"
>;

/**
 * One stable serializable response shape. Internal-only properties are optional
 * because they are omitted entirely for Creator/Studio actors without finance.read.
 */
export type ServiceQuoteResponseLine =
  Omit<ServiceQuoteLine, keyof InternalQuoteLineFields> &
  Partial<InternalQuoteLineFields>;

export type ServiceQuoteResponse =
  Omit<ServiceQuote, keyof InternalQuoteFields | "lines"> &
  Partial<InternalQuoteFields> & {
    lines: ServiceQuoteResponseLine[];
  };

function customerLine(line: ServiceQuoteLine): ServiceQuoteResponseLine {
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
export function toServiceQuoteResponse(
  quote: ServiceQuote,
  includeInternalFinancials: boolean,
): ServiceQuoteResponse {
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
      lines: quote.lines
        .filter((line) => line.classification !== "INTERNAL")
        .map(customerLine),
    };
  }

  return {
    ...common,
    estimatedCostPaise: quote.estimatedCostPaise,
    estimatedMarginPaise: quote.estimatedMarginPaise,
    lines: quote.lines,
  };
}
