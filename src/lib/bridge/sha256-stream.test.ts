import assert from "node:assert/strict";
import test from "node:test";
import { Sha256Stream } from "./sha256-stream.ts";

test("streaming SHA-256 matches standard empty and abc vectors", () => {
  assert.equal(new Sha256Stream().digestHex(), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(new Sha256Stream().update(new TextEncoder().encode("abc")).digestHex(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("streaming SHA-256 is invariant to arbitrary chunk boundaries", () => {
  const bytes = new TextEncoder().encode("The quick brown fox jumps over the lazy dog".repeat(1000));
  const single = new Sha256Stream().update(bytes).digestHex();
  const split = new Sha256Stream();
  for (let i = 0; i < bytes.length; i += 37) split.update(bytes.subarray(i, i + 37));
  assert.equal(split.digestHex(), single);
});
