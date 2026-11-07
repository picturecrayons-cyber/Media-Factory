import test from "node:test";
import assert from "node:assert/strict";
import { hashReadableStream } from "./oci-object-storage.server.ts";

function streamOf(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

test("streaming checksum hashes chunks without requiring a contiguous buffer", async () => {
  const result = await hashReadableStream(
    streamOf([new TextEncoder().encode("a"), new TextEncoder().encode("bc")]),
    3,
  );
  assert.equal(result.byteSize, 3);
  assert.equal(result.sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("streaming checksum rejects a truncated stream", async () => {
  await assert.rejects(
    hashReadableStream(streamOf([new TextEncoder().encode("ab")]), 3),
    /does not match its declared size/,
  );
});

test("streaming checksum rejects a stream larger than its declared size", async () => {
  await assert.rejects(
    hashReadableStream(streamOf([new TextEncoder().encode("abcd")]), 3),
    /exceeded its declared size/,
  );
});
