/**
 * Versioned introductory Studio plan catalog.
 * Prices are base INR amounts exclusive of applicable GST.
 * This is display/catalog data only; it does not activate checkout or entitlements.
 */
export const STUDIO_PLAN_CATALOG = {
  monthly: {
    key: "studio_monthly",
    label: "Studio Monthly",
    amountPaise: 299900,
    currency: "INR",
    interval: "month",
    taxMode: "exclusive",
    taxRateBasisPoints: null,
  },
  yearly: {
    key: "studio_yearly_intro",
    label: "Studio Annual Introductory",
    amountPaise: 2499900,
    currency: "INR",
    interval: "year",
    taxMode: "exclusive",
    taxRateBasisPoints: null,
  },
} as const;

export type StudioPlanKey = keyof typeof STUDIO_PLAN_CATALOG;

export function getStudioPlan(key: StudioPlanKey) {
  return STUDIO_PLAN_CATALOG[key];
}

export function getStudioAnnualSavings() {
  const monthlyAnnualized = STUDIO_PLAN_CATALOG.monthly.amountPaise * 12;
  const annual = STUDIO_PLAN_CATALOG.yearly.amountPaise;
  const savingsPaise = monthlyAnnualized - annual;
  return {
    monthlyAnnualizedPaise: monthlyAnnualized,
    annualAmountPaise: annual,
    savingsPaise,
    savingsBasisPoints: Math.round((savingsPaise / monthlyAnnualized) * 10_000),
  };
}
