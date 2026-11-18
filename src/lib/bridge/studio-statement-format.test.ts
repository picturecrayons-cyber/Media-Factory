import assert from "node:assert/strict";
import test from "node:test";
import { formatStudioMinorAmount, normalizeStudioMinorAmount } from "./studio-statement-format.ts";

test("INR formatting preserves paise and Indian digit grouping", () => {
  assert.equal(formatStudioMinorAmount("123456789", "INR"), "₹12,34,567.89");
  assert.equal(formatStudioMinorAmount("0", "INR"), "₹0.00");
  assert.equal(formatStudioMinorAmount("-12345", "INR"), "-₹123.45");
});

test("large amounts remain exact beyond Number safe integer range", () => {
  const amount = "900719925474099312345";
  assert.equal(normalizeStudioMinorAmount(amount), amount);
  assert.equal(formatStudioMinorAmount(amount, "INR"), "₹90,07,19,92,54,74,09,93,123.45");
});

test("non-INR amounts remain explicitly in minor units", () => {
  assert.equal(formatStudioMinorAmount("2500", "USD"), "2,500 USD minor units");
});

test("unsafe numeric and malformed values fail closed", () => {
  assert.equal(normalizeStudioMinorAmount(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(formatStudioMinorAmount("1.25", "INR"), "Amount unavailable");
  assert.equal(formatStudioMinorAmount("NaN", "INR"), "Amount unavailable");
  assert.equal(formatStudioMinorAmount(null, "INR"), "Not reported");
});
