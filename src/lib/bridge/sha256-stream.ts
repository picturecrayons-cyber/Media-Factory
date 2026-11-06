import { createHash } from "node:crypto";

/** Incrementally hash a complete object stream without buffering it in memory. */
export async function sha256ReadableStream(body: ReadableStream<Uint8Array>, expectedByteSize: number) {
  if (!Number.isSafeInteger(expectedByteSize) || expectedByteSize <= 0) {
    throw new Error("A positive expected object size is required for checksum verification");
  }
  const hash = createHash("sha256");
  const reader = body.getReader();
  let byteSize = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteSize += value.byteLength;
      if (byteSize > expectedByteSize) {
        await reader.cancel();
        throw new Error("Object exceeded the expected byte size during checksum verification");
      }
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (byteSize !== expectedByteSize) {
    throw new Error(`Object size mismatch during checksum verification: expected ${expectedByteSize}, received ${byteSize}`);
  }
  return { byteSize, checksumSha256: hash.digest("hex") };
}