import assert from "node:assert/strict";
import test from "node:test";
import { assertAllocationsWithinNetRevenue, assertOwnerInterestShares, assertReconciliationBalanced, investorRemainingCap, ownerEntitlementPaise } from "./title-finance-policy.ts";

test("title ownership must be unique and total exactly 100 percent", () => {
  assert.equal(assertOwnerInterestShares([{ ownerUserId: "owner-a", shareBps: 6000 }, { ownerUserId: "owner-b", shareBps: 4000 }]), 10000);
  assert.throws(() => assertOwnerInterestShares([{ ownerUserId: "owner-a", shareBps: 6000 }]), /exactly 10000/);
  assert.throws(() => assertOwnerInterestShares([{ ownerUserId: "owner-a", shareBps: 5000 }, { ownerUserId: "owner-a", shareBps: 5000 }]), /unique/);
});

test("owner entitlement is calculated in paise without floating point currency", () => {
  assert.equal(ownerEntitlementPaise(10001, 5000), 5000);
  assert.throws(() => ownerEntitlementPaise(-1, 5000), /Invalid net/);
});

test("licensing allocations cannot exceed net licensing revenue", () => {
  assert.deepEqual(assertAllocationsWithinNetRevenue(10000, [{ amountPaise: 6000, beneficiaryType: "OWNER" }, { amountPaise: 2000, beneficiaryType: "INVESTOR" }]), { allocatedPaise: 8000, unallocatedPaise: 2000 });
  assert.throws(() => assertAllocationsWithinNetRevenue(10000, [{ amountPaise: 10001, beneficiaryType: "OWNER" }]), /cannot exceed/);
  assert.throws(() => assertAllocationsWithinNetRevenue(10000, [{ amountPaise: 0, beneficiaryType: "BRIDGE" }]), /positive integer/);
});

test("investor cap prevents returns beyond approved agreement cap", () => {
  assert.equal(investorRemainingCap(50000, 30000), 20000);
  assert.equal(investorRemainingCap(50000, 60000), 0);
  assert.equal(investorRemainingCap(null, 30000), null);
});

test("reconciliation flags unallocated balances and blocks over-allocation", () => {
  assert.deepEqual(assertReconciliationBalanced(10000, 10000), { unallocatedPaise: 0, balanced: true });
  assert.deepEqual(assertReconciliationBalanced(10000, 7000), { unallocatedPaise: 3000, balanced: false });
  assert.throws(() => assertReconciliationBalanced(10000, 10001), /exceed/);
});
