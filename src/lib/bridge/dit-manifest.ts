import { createHash } from "node:crypto";

export type DitManifestFile = {
  relativePath: string;
  byteSize: number;
  sha256: string;
};

export type DitManifest = {
  root?: string;
  cameraUnit?: "A" | "B" | "C";
  cardLabel?: string;
  generatedAt?: string;
  files: DitManifestFile[];
  manifestSha256?: string;
};

export function normalizeDitFiles(input: unknown): DitManifestFile[] {
  if (!Array.isArray(input)) throw new Error("Manifest files must be an array");
  if (input.length === 0) throw new Error("The camera card manifest contains no files");
  if (input.length > 10000) throw new Error("A single camera card is limited to 10,000 files");

  const seen = new Set<string>();
  const normalized = input.map((value, index) => {
    if (!value || typeof value !== "object") throw new Error(`Manifest entry ${index + 1} is invalid`);
    const row = value as Record<string, unknown>;
    if (typeof row.relativePath !== "string") throw new Error(`Manifest entry ${index + 1} has no relative path`);
    const relativePath = row.relativePath.replace(/\\/g, "/").trim();
    const parts = relativePath.split("/");
    if (
      !relativePath ||
      relativePath.startsWith("/") ||
      /^[a-zA-Z]:/.test(relativePath) ||
      relativePath.includes("\0") ||
      parts.some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error(`Unsafe relative path in manifest entry ${index + 1}`);
    }
    if (relativePath.length > 1024) throw new Error("A manifest path exceeds 1,024 characters");
    const collisionKey = relativePath.toLocaleLowerCase("en-US");
    if (seen.has(collisionKey)) throw new Error(`Duplicate or case-colliding path: ${relativePath}`);
    seen.add(collisionKey);

    const byteSize = row.byteSize;
    if (!Number.isSafeInteger(byteSize) || Number(byteSize) < 0) {
      throw new Error(`Invalid byte size for ${relativePath}`);
    }
    const sha256 = typeof row.sha256 === "string" ? row.sha256.toLowerCase() : "";
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`Invalid SHA-256 checksum for ${relativePath}`);
    return { relativePath, byteSize: Number(byteSize), sha256 };
  });

  normalized.sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
  return normalized;
}

export function ditManifestDigest(files: DitManifestFile[]): string {
  const canonical = normalizeDitFiles(files).map((file) => ({
    relativePath: file.relativePath,
    byteSize: file.byteSize,
    sha256: file.sha256,
  }));
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

export function ditManifestTotals(files: DitManifestFile[]) {
  const totalBytes = files.reduce((total, file) => total + file.byteSize, 0);
  if (!Number.isSafeInteger(totalBytes)) throw new Error("Manifest total size exceeds the safe integer limit");
  return { fileCount: files.length, totalBytes };
}
