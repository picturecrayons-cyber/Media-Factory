import test from "node:test";
import assert from "node:assert/strict";
import {
  STUDIO_PLAN_CATALOG,
  getStudioAnnualSavings,
  getStudioPlan,
} from "./studio-plan-catalog.ts";

test("Studio introductory plan prices are fixed in INR and GST-exclusive", () => {
  assert.equal(STUDIO_PLAN_CATALOG.monthly.amountPaise, 299900);
  assert.equal(STUDIO_PLAN_CATALOG.yearly.amountPaise, 2499900);
  assert.equal(STUDIO_PLAN_CATALOG.monthly.currency, "INR");
  assert.equal(STUDIO_PLAN_CATALOG.yearly.currency, "INR");
  assert.equal(STUDIO_PLAN_CATALOG.monthly.taxMode, "exclusive");
  assert.equal(STUDIO_PLAN_CATALOG.yearly.taxMode, "exclusive");
  assert.equal(STUDIO_PLAN_CATALOG.monthly.taxRateBasisPoints, null);
  assert.equal(STUDIO_PLAN_CATALOG.yearly.taxRateBasisPoints, null);
});

test("annual introductory plan saves INR 10,989 versus twelve monthly payments", () => {
  const savings = getStudioAnnualSavings();
  assert.equal(savings.monthlyAnnualizedPaise, 3598800);
  assert.equal(savings.annualAmountPaise, 2499900);
  assert.equal(savings.savingsPaise, 1098900);
  assert.equal(savings.savingsBasisPoints, 3054);
});

test("plan lookup returns the authoritative catalog entry", () => {
  assert.equal(getStudioPlan("monthly").key, "studio_monthly");
  assert.equal(getStudioPlan("yearly").key, "studio_yearly_intro");
});
