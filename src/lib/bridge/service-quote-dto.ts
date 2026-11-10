export type ServiceQuoteClassification = "BILLABLE" | "INCLUDED" | "INTERNAL" | "PASS_THROUGH";

type InternalServiceQuoteLine<TEvidence> = {
  serviceCode: string;
  classification: ServiceQuoteClassification;
  pricingMethod: string;
  unitLabel: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  rateId: string;
  rateVersion: number;
  costBasisPaise: number;
  estimatedMarginPaise: number;
  evidence: TEvidence;
};

/**
 * Builds the only response shape allowed for a customer-created service quote.
 * Internal costing, margin, rate identifiers and INTERNAL-classified lines never
 * cross the server response boundary. Included work is shown at zero customer cost.
 */
export function toCustomerServiceQuote<TDetectedAssets, TRequiredWork, TEvidence>(input: {
  quoteId: string;
  quoteNumber: string;
  status: "QUOTED";
  currency: "INR";
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  estimatedCostPaise: number;
  estimatedMarginPaise: number;
  detectedAssets: TDetectedAssets;
  requiredWork: TRequiredWork;
  lines: InternalServiceQuoteLine<TEvidence>[];
}) {
  return {
    quoteId: input.quoteId,
    quoteNumber: input.quoteNumber,
    status: input.status,
    currency: input.currency,
    subtotalPaise: input.subtotalPaise,
    taxPaise: input.taxPaise,
    totalPaise: input.totalPaise,
    detectedAssets: input.detectedAssets,
    requiredWork: input.requiredWork,
    lines: input.lines
      .filter((line) => line.classification !== "INTERNAL")
      .map((line) => ({
        serviceCode: line.serviceCode,
        classification: line.classification,
        pricingMethod: line.pricingMethod,
        unitLabel: line.unitLabel,
        quantity: line.quantity,
        unitPricePaise: line.classification === "INCLUDED" ? 0 : line.unitPricePaise,
        lineTotalPaise: line.classification === "INCLUDED" ? 0 : line.lineTotalPaise,
        evidence: line.evidence,
      })),
  };
}
