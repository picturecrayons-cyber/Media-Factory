import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sha256ReadableStream } from "./sha256-stream.ts";

test("computes the standard SHA-256 digest across streamed chunks", async () => {
  const bytes = new TextEncoder().encode("Crayons Bridge SHA-256 verification");
  const expected = createHash("sha256").update(bytes).digest("hex");
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(bytes.slice(0, 9)); controller.enqueue(bytes.slice(9)); controller.close(); },
  });
  assert.deepEqual(await sha256ReadableStream(body, bytes.byteLength), { byteSize: bytes.byteLength, checksumSha256: expected });
});
test("rejects truncated or oversized object streams", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } });
  await assert.rejects(() => sha256ReadableStream(body, 4), /size mismatch/);
  const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } });
  await assert.rejects(() => sha256ReadableStream(oversized, 2), /exceeded the expected byte size/);
});