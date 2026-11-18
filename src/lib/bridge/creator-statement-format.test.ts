import assert from "node:assert/strict";
import test from "node:test";
import { formatCreatorStatementAmount, sumCreatorStatementAmounts } from "./creator-statement-format.ts";

test("INR statement amounts preserve paise and Indian digit grouping", () => {
  assert.equal(formatCreatorStatementAmount("123456789", "INR"), "₹12,34,567.89");
  assert.equal(formatCreatorStatementAmount("0", "INR"), "₹0.00");
});

test("large minor-unit amounts remain exact beyond Number safe integer range", () => {
  assert.equal(
    formatCreatorStatementAmount("900719925474099312345", "INR"),
    "₹9,00,71,99,25,47,40,99,312.45",
  );
});

test("statement totals remain separated by currency", () => {
  assert.deepEqual(
    sumCreatorStatementAmounts([
      { amountPaise: "10000", currency: "INR" },
      { amountPaise: "2500", currency: "USD" },
      { amountPaise: "200", currency: "INR" },
    ]),
    [
      { currency: "INR", amountMinor: "10200" },
      { currency: "USD", amountMinor: "2500" },
    ],
  );
});

test("invalid minor-unit amounts fail closed", () => {
  assert.equal(formatCreatorStatementAmount("not-a-number", "INR"), "Amount unavailable");
  assert.throws(
    () => sumCreatorStatementAmounts([{ amountPaise: "NaN", currency: "INR" }]),
    /invalid minor-unit amount/,
  );
});
