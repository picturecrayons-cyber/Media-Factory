/** Pure guards shared by the browser multipart uploader and server confirmation. */
export function multipartPartCount(byteSize: number, partSize: number): number {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) throw new Error("Upload size must be a positive safe integer");
  if (!Number.isSafeInteger(partSize) || partSize <= 0) throw new Error("Multipart part size must be positive");
  const count = Math.ceil(byteSize / partSize);
  if (count < 1 || count > 10_000) throw new Error("File size is outside OCI multipart upload limits");
  return count;
}

export function assertMultipartEtags(etags: readonly (string | undefined)[], expectedPartCount: number): string[] {
  if (!Number.isSafeInteger(expectedPartCount) || expectedPartCount < 1 || expectedPartCount > 10_000) {
    throw new Error("Invalid OCI multipart part count");
  }
  if (etags.length !== expectedPartCount || etags.some((etag) => typeof etag !== "string" || etag.trim().length === 0)) {
    throw new Error("Multipart upload is missing one or more part ETags");
  }
  return etags.map((etag) => etag!.trim());
}

export function assertExpectedUploadSize(actualByteSize: number, expectedByteSize?: number): void {
  if (!Number.isSafeInteger(actualByteSize) || actualByteSize <= 0) {
    throw new Error("Uploaded object is empty");
  }
  if (expectedByteSize !== undefined && actualByteSize !== expectedByteSize) {
    throw new Error("Uploaded object size does not match the file that was sent");
  }
}
