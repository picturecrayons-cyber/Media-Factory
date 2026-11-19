export type ByteRange = { start: number; end: number };

export function parseSingleByteRange(header: string | null, totalBytes: number): ByteRange | null {
  if (header === null) return null;
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) throw new RangeError("Invalid object size");
  const value = header.trim();
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new RangeError("Unsupported byte range");
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new RangeError("Invalid suffix range");
    start = Math.max(totalBytes - suffix, 0);
    end = totalBytes - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : totalBytes - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= totalBytes) {
    throw new RangeError("Byte range is not satisfiable");
  }
  return { start, end: Math.min(end, totalBytes - 1) };
}

export function validateMediaResponse(opts: {
  status: number;
  contentRange: string | null;
  contentLength: string | null;
  requestedRange: ByteRange | null;
  totalBytes: number;
  expectedContentType: string;
  actualContentType: string;
}): boolean {
  if (opts.actualContentType !== opts.expectedContentType ||
      !opts.expectedContentType.startsWith("video/") ||
      !Number.isSafeInteger(opts.totalBytes) || opts.totalBytes <= 0) return false;
  const length = Number(opts.contentLength);
  if (!Number.isSafeInteger(length) || length <= 0) return false;
  if (!opts.requestedRange) {
    return opts.status === 200 && length === opts.totalBytes && opts.contentRange === null;
  }
  const { start, end } = opts.requestedRange;
  const expectedLength = end - start + 1;
  return opts.status === 206 &&
    length === expectedLength &&
    opts.contentRange === `bytes ${start}-${end}/${opts.totalBytes}`;
}
