export type CustomerServiceQuoteLineInput = {
  serviceName: string;
  unitLabel: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
};

export type CustomerServiceQuoteInput = {
  quoteId: string;
  quoteNumber: string;
  status: string;
  currency: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  lines: CustomerServiceQuoteLineInput[];
};

/**
 * Explicit allowlist for Creator/Studio quote responses.
 * Internal rate identifiers, classifications, evidence, cost basis and margin
 * remain server-side and are never serialized into the customer DTO.
 */
export function toCustomerServiceQuoteDto(input: CustomerServiceQuoteInput) {
  return {
    quoteId: input.quoteId,
    quoteNumber: input.quoteNumber,
    status: input.status,
    currency: input.currency,
    subtotalPaise: input.subtotalPaise,
    taxPaise: input.taxPaise,
    totalPaise: input.totalPaise,
    lines: input.lines.map((line) => ({
      serviceName: line.serviceName,
      unitLabel: line.unitLabel,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      lineTotalPaise: line.lineTotalPaise,
    })),
  };
}
