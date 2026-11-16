import assert from "node:assert/strict";
import test from "node:test";
import { assertTitleControlClear } from "./title-controls-policy.ts";

test("CLEAR and missing title controls permit normal processing", () => {
  assert.doesNotThrow(() => assertTitleControlClear("CLEAR"));
  assert.doesNotThrow(() => assertTitleControlClear(undefined));
});
test("HOLD and BLOCK fail closed with distinct recovery guidance", () => {
  assert.throws(() => assertTitleControlClear("HOLD"), /TITLE_ON_HOLD/);
  assert.throws(() => assertTitleControlClear("BLOCK"), /TITLE_BLOCKED/);
});
