export const MULTIPART_PART_SIZE = 16 * 1024 * 1024;
export const MULTIPART_MIN_FILE = 512 * 1024 * 1024;

export type UploadSession = {
  version: 1;
  titleId: string;
  kind: string;
  assetId: string;
  uploadId: string;
  partBaseUrl: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  partSize: number;
  completedParts: number[];
  committed: boolean;
  expiresAt: number;
};

export function sessionStorageKey(titleId: string, kind: string) {
  return `bridge-upload:${titleId}:${kind}`;
}

export function partCount(fileSize: number, partSize = MULTIPART_PART_SIZE) {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) return 0;
  return Math.ceil(fileSize / partSize);
}

export function partSlice(fileSize: number, partNumber: number, partSize = MULTIPART_PART_SIZE) {
  const start = (partNumber - 1) * partSize;
  const end = Math.min(fileSize, start + partSize);
  return { start, end };
}

export function nextPart(completed: readonly number[], total: number) {
  const done = new Set(completed);
  for (let part = 1; part <= total; part += 1) {
    if (!done.has(part)) return part;
  }
  return null;
}

export function loadedBytes(completed: readonly number[], fileSize: number, partSize = MULTIPART_PART_SIZE) {
  let loaded = 0;
  for (const part of completed) {
    const { start, end } = partSlice(fileSize, part, partSize);
    if (end > start) loaded += end - start;
  }
  return Math.min(fileSize, loaded);
}

export function sameUploadFile(
  session: { fileName: string; fileSize: number; lastModified: number },
  file: { name: string; size: number; lastModified: number },
) {
  return session.fileName === file.name && session.fileSize === file.size && session.lastModified === file.lastModified;
}

/** The part URL is a write capability. Accept only this region's Oracle host and this object key. */
export function multipartTargetAllowed(partBaseUrl: string, region: string, objectKey: string) {
  let url: URL;
  try {
    url = new URL(partBaseUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password || url.search || url.hash) return false;
  if (url.host !== `objectstorage.${region}.oraclecloud.com`) return false;
  const path = url.pathname;
  if (!path.startsWith("/p/") || !path.endsWith("/")) return false;
  const decoded = safeDecode(path);
  return decoded.includes(`/u/${objectKey}/id/`) || path.includes(`/u/${encodeURIComponent(objectKey)}/id/`);
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type RemoteMultipartPart = { partNumber: number; size: number };

/** Validate OCI's authoritative remote part list against the persisted upload manifest. */
export function validateCompletedMultipartParts(
  parts: readonly RemoteMultipartPart[],
  fileSize: number,
  partSize: number,
): number[] {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 ||
      !Number.isSafeInteger(partSize) || partSize < 5 * 1024 * 1024) {
    throw new Error("Multipart manifest has invalid file or part size");
  }
  const total = Math.ceil(fileSize / partSize);
  if (total > 10_000 || parts.length !== total) {
    throw new Error("OCI multipart upload is incomplete; refusing to commit");
  }
  for (let index = 0; index < total; index += 1) {
    const part = parts[index];
    const expectedSize = index < total - 1 ? partSize : fileSize - index * partSize;
    if (!part || part.partNumber !== index + 1 || part.size !== expectedSize) {
      throw new Error("OCI multipart parts do not match the complete manifest; refusing to commit");
    }
  }
  return parts.map((part) => part.partNumber);
}
