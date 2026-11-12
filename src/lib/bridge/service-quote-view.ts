import type { Actor } from "./rbac.ts";
import { hasStaffPermission } from "./rbac.ts";

type InternalPricingLine = {
  costBasisPaise: number;
  estimatedMarginPaise: number;
};

type InternalPricingQuote<TLine extends InternalPricingLine> = {
  estimatedCostPaise: number;
  estimatedMarginPaise: number;
  lines: TLine[];
  [key: string]: unknown;
};

/**
 * Customer-facing quote projection. Internal cost and margin remain persisted
 * for Finance/Admin reconciliation but are never returned to Creator/Studio/
 * Buyer callers unless their independently granted staff role includes finance.read.
 */
export function presentServiceQuote<TLine extends InternalPricingLine, TQuote extends InternalPricingQuote<TLine>>(
  actor: Actor,
  quote: TQuote,
): TQuote | Omit<TQuote, "estimatedCostPaise" | "estimatedMarginPaise" | "lines"> & {
  lines: Array<Omit<TLine, "costBasisPaise" | "estimatedMarginPaise">>;
} {
  if (hasStaffPermission(actor, "finance.read")) return quote;
  const { estimatedCostPaise: _cost, estimatedMarginPaise: _margin, lines, ...publicFields } = quote;
  return {
    ...publicFields,
    lines: lines.map(({ costBasisPaise: _lineCost, estimatedMarginPaise: _lineMargin, ...line }) => line),
  };
}
