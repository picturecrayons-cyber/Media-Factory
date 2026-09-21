import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TITLE_STATUS_ORDER,
  assertTransition,
  canTransition,
  isBuyerVisible,
  nextStatus,
} from "./lifecycle.ts";

describe("title lifecycle", () => {
  it("walks the canonical forward chain and stops at DELIVERED", () => {
    let current = TITLE_STATUS_ORDER[0];
    for (let i = 0; i < TITLE_STATUS_ORDER.length - 1; i += 1) {
      const nxt = nextStatus(current);
      assert.equal(nxt, TITLE_STATUS_ORDER[i + 1]);
      assert.equal(canTransition(current, nxt!), true);
      current = nxt!;
    }
    assert.equal(nextStatus("DELIVERED"), null);
  });

  it("rejects backward and skip transitions", () => {
    assert.equal(canTransition("QC_REVIEW", "DRAFT"), false);
    assert.equal(canTransition("DRAFT", "LIVE_FOR_BUYERS"), false);
    assert.throws(() => assertTransition("LICENSED", "IN_NEGOTIATION"));
  });

  it("exposes titles to buyers only from LIVE_FOR_BUYERS onward", () => {
    assert.equal(isBuyerVisible("DRAFT"), false);
    assert.equal(isBuyerVisible("QC_REVIEW"), false);
    assert.equal(isBuyerVisible("LICENSING_READY"), false);
    assert.equal(isBuyerVisible("LIVE_FOR_BUYERS"), true);
    assert.equal(isBuyerVisible("IN_NEGOTIATION"), true);
    assert.equal(isBuyerVisible("LICENSED"), true);
    assert.equal(isBuyerVisible("DELIVERED"), true);
  });
});
