import assert from "node:assert/strict";
import test from "node:test";
import { formatCreatorMinorAmount, formatCreatorRoyaltyDate } from "./creator-royalties-format.ts";

test("INR creator payable formatting preserves paise and Indian grouping", () => {
  assert.equal(formatCreatorMinorAmount("123456789", "INR"), "₹12,34,567.89");
  assert.equal(formatCreatorMinorAmount("0", "INR"), "₹0.00");
});

test("non-INR minor units are not misrepresented as rupees", () => {
  assert.equal(formatCreatorMinorAmount("1250", "USD"), "1250 USD minor units");
});

test("invalid amount and dates fail safely", () => {
  assert.equal(formatCreatorMinorAmount("not-a-number", "INR"), "Amount unavailable");
  assert.equal(formatCreatorRoyaltyDate(null), "Not recorded");
  assert.equal(formatCreatorRoyaltyDate("not-a-date"), "Not recorded");
});
