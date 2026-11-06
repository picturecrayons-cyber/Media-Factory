export type UploadPartManifestEntry = {
  partNumber: number;
  byteStart: number;
  byteEnd: number;
  etag: string;
};

export type UploadManifestExpectation = {
  expectedSize: number;
  partSize: number;
  maxParts?: number;
};

/** Validate a complete, contiguous, non-overlapping manifest before provider assembly. */
export function validatePartManifest(
  parts: readonly UploadPartManifestEntry[],
  expected: UploadManifestExpectation,
): UploadPartManifestEntry[] {
  if (!Number.isSafeInteger(expected.expectedSize) || expected.expectedSize <= 0) {
    throw new Error("Expected upload size must be a positive safe integer");
  }
  if (!Number.isSafeInteger(expected.partSize) || expected.partSize < 5 * 1024 * 1024) {
    throw new Error("Multipart part size is invalid");
  }
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > (expected.maxParts ?? 10_000)) {
    throw new Error("Multipart manifest has an invalid part count");
  }
  const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  let cursor = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    const part = ordered[i];
    if (!Number.isSafeInteger(part.partNumber) || part.partNumber !== i + 1) {
      throw new Error("Multipart parts must be consecutively numbered from 1");
    }
    if (!Number.isSafeInteger(part.byteStart) || !Number.isSafeInteger(part.byteEnd) ||
        part.byteStart !== cursor || part.byteEnd <= part.byteStart || part.byteEnd > expected.expectedSize) {
      throw new Error("Multipart part byte ranges must be contiguous and within the expected file size");
    }
    const length = part.byteEnd - part.byteStart;
    const finalPart = i === ordered.length - 1;
    if (!finalPart && length !== expected.partSize) {
      throw new Error("Every non-final multipart part must match the configured part size");
    }
    if (finalPart && length > expected.partSize) {
      throw new Error("Final multipart part exceeds the configured part size");
    }
    if (typeof part.etag !== "string" || !part.etag.trim() || part.etag.length > 512 ||
        /[\r\n]/.test(part.etag)) {
      throw new Error("Multipart part ETag is invalid");
    }
    cursor = part.byteEnd;
  }
  if (cursor !== expected.expectedSize) {
    throw new Error("Multipart manifest does not cover the expected file size");
  }
  return ordered;
}

export function assertImmutableVerifiedPointer(input: {
  currentVerifiedKey: string | null;
  nextVerifiedKey: string;
}) {
  if (!input.nextVerifiedKey.trim()) throw new Error("Verified object key is required");
  if (input.currentVerifiedKey && input.currentVerifiedKey !== input.nextVerifiedKey) {
    throw new Error("A verified object pointer is immutable");
  }
}
