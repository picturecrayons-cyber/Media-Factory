export function calculateServiceLine(input: {
  unitPricePaise: number;
  minimumPricePaise: number;
  quantity: number;
  costBasisPaise: number;
}) {
  const unitPrice = Math.round(Number(input.unitPricePaise));
  const minimum = Math.round(Number(input.minimumPricePaise));
  const quantity = Number(input.quantity);
  const costBasis = Math.round(Number(input.costBasisPaise));
  if (![unitPrice, minimum, costBasis].every(Number.isFinite) || unitPrice < 0 || minimum < 0 || costBasis < 0) {
    throw new Error("Invalid money amount");
  }
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Invalid quantity");
  const lineTotalPaise = Math.max(Math.round(unitPrice * quantity), minimum);
  const costPaise = Math.round(costBasis * quantity);
  return {
    lineTotalPaise,
    costPaise,
    estimatedMarginPaise: lineTotalPaise - costPaise,
  };
}

export function calculateRefundSplit(input: {
  refundTotalPaise: number;
  invoiceSubtotalPaise: number;
  invoiceTaxPaise: number;
  invoiceTotalPaise: number;
}) {
  const refundTotalPaise = Math.round(Number(input.refundTotalPaise));
  const subtotal = Math.round(Number(input.invoiceSubtotalPaise));
  const tax = Math.round(Number(input.invoiceTaxPaise));
  const total = Math.round(Number(input.invoiceTotalPaise));
  if (![refundTotalPaise, subtotal, tax, total].every(Number.isFinite) || refundTotalPaise < 0 || subtotal < 0 || tax < 0 || total < 0) {
    throw new Error("Invalid refund amount");
  }
  if (refundTotalPaise === 0 || total === 0) return { refundRevenuePaise: 0, refundTaxPaise: 0 };
  const refundTaxPaise = Math.min(tax, Math.max(0, Math.round(refundTotalPaise * tax / total)));
  return {
    refundRevenuePaise: Math.max(0, refundTotalPaise - refundTaxPaise),
    refundTaxPaise,
  };
}

export function calculateNetProfit(input: {
  revenuePaise: number;
  refundsPaise: number;
  taxPaise: number;
  paymentFeesPaise: number;
  operatingCostsPaise: number;
  passThroughCostsPaise: number;
  settlementsPaise: number;
}) {
  return input.revenuePaise -
    input.refundsPaise -
    input.taxPaise -
    input.paymentFeesPaise -
    input.operatingCostsPaise -
    input.passThroughCostsPaise -
    input.settlementsPaise;
}
