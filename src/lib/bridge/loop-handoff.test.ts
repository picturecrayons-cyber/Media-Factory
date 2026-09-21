import assert from "node:assert/strict";
import test from "node:test";
import { assertLoopHandoffReady, signLoopHandoffBody } from "./loop-handoff.ts";

test("loop ingest fails closed when unset", () => {
  assert.throws(() => assertLoopHandoffReady({}), /Loop ingest is unset/);
  assert.throws(() => assertLoopHandoffReady({ url: "https://example.com", secret: "" }), /unset/);
});

test("loop ingest rejects non-https", () => {
  assert.throws(
    () => assertLoopHandoffReady({ url: "http://crayonsloop.com/ingest", secret: "x" }),
    /https/,
  );
});

test("hmac is deterministic", () => {
  const a = signLoopHandoffBody('{"titleId":"1"}', "secret");
  const b = signLoopHandoffBody('{"titleId":"1"}', "secret");
  const c = signLoopHandoffBody('{"titleId":"2"}', "secret");
  assert.equal(a, b);
  assert.notEqual(a, c);
});
