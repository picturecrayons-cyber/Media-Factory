#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

function readFlag(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}
async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
async function walk(root, directory = root, entries = []) {
  const rows = await readdir(directory, { withFileTypes: true });
  rows.sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (const row of rows) {
    const absolute = path.join(directory, row.name);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Symlink is not allowed in camera manifest: ${absolute}`);
    if (info.isDirectory()) {
      await walk(root, absolute, entries);
    } else if (info.isFile()) {
      const relativePath = path.relative(root, absolute).split(path.sep).join("/");
      entries.push({ relativePath, byteSize: info.size, sha256: await hashFile(absolute) });
      if (entries.length > 10000) throw new Error("A single camera card is limited to 10,000 files");
    }
  }
  return entries;
}
async function main() {
  const root = path.resolve(process.argv[2] ?? "");
  const cameraUnit = readFlag("--camera");
  const cardLabel = readFlag("--card");
  const output = path.resolve(readFlag("--output", "./dit-manifest.json"));
  if (!process.argv[2] || !["A", "B", "C"].includes(cameraUnit) || !cardLabel) {
    throw new Error("Usage: node scripts/dit-manifest.mjs <card-folder> --camera A|B|C --card CARD_LABEL --output manifest.json");
  }
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory()) throw new Error("The camera source path must be a directory");
  const files = await walk(root);
  if (!files.length) throw new Error("The selected camera card contains no files");
  files.sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
  const canonical = files.map(({ relativePath, byteSize, sha256 }) => ({ relativePath, byteSize, sha256 }));
  const manifestSha256 = createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
  const totalBytes = files.reduce((total, file) => total + file.byteSize, 0);
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    root,
    cameraUnit,
    cardLabel,
    fileCount: files.length,
    totalBytes,
    files,
    manifestSha256,
  };
  await writeFile(output, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(`Manifest saved: ${output}\nCamera: ${cameraUnit} | Card: ${cardLabel}\nFiles: ${files.length} | Bytes: ${totalBytes}\nSHA-256: ${manifestSha256}\nNo media files were copied, moved, renamed or deleted.\n`);
}
main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
