#!/usr/bin/env node
/**
 * One-title HLS packaging worker.
 *
 * Runs on a controlled worker with FFmpeg and Bridge OCI credentials.
 * It downloads a Bridge QC master, creates a VOD HLS rendition, uploads each
 * object to OCI, then re-downloads each object through the OCI verifier and
 * emits a JSON evidence manifest. It NEVER writes database rows or publishes.
 *
 * Required env:
 *   BRIDGE_TITLE_ID, BRIDGE_MASTER_KEY, BRIDGE_RENDITION_PREFIX
 *   OCI_TENANCY_OCID, OCI_USER_OCID, OCI_FINGERPRINT, OCI_PRIVATE_KEY,
 *   OCI_REGION, OCI_NAMESPACE, OCI_BUCKET_NAME
 */
import { createHash } from "node:crypto";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

const execFile = promisify(execFileCallback);
const required = [
  "BRIDGE_TITLE_ID", "BRIDGE_MASTER_KEY", "BRIDGE_RENDITION_PREFIX",
  "OCI_TENANCY_OCID", "OCI_USER_OCID", "OCI_FINGERPRINT",
  "OCI_PRIVATE_KEY", "OCI_REGION", "OCI_NAMESPACE", "OCI_BUCKET_NAME",
];
const missing = required.filter((name) => !String(process.env[name] ?? "").trim());
if (missing.length) throw new Error(`PACKAGING_BLOCKED missing environment: ${missing.join(", ")}`);

const titleId = process.env.BRIDGE_TITLE_ID.trim();
const masterKey = process.env.BRIDGE_MASTER_KEY.trim();
const prefix = process.env.BRIDGE_RENDITION_PREFIX.trim().replace(/^\/+|\/+$/g, "");
if (!/^[a-zA-Z0-9_-]{1,128}$/.test(titleId)) throw new Error("Invalid Bridge title ID");
for (const value of [masterKey, prefix]) {
  if (!value || value.startsWith("http:") || value.startsWith("https:") || value.split("/").includes("..")) {
    throw new Error("Object keys must be relative OCI keys without traversal or URLs");
  }
}
if (prefix === masterKey || prefix.startsWith(masterKey + "/")) {
  throw new Error("Rendition output must not overwrite or nest beneath the QC master key");
}
if (!prefix.startsWith(`bridge-renditions/${titleId}/`)) {
  throw new Error("Rendition prefix must be scoped to bridge-renditions/<titleId>/");
}

const { signDownload, signUpload, verifyObjectSha256 } =
  await import("../src/lib/bridge/oci-object-storage.server.ts");
const workDir = await mkdtemp(path.join(os.tmpdir(), "bridge-hls-"));
const sourcePath = path.join(workDir, "source.master");
const outputDir = path.join(workDir, "hls");
const hashFile = async (file) => {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest("hex"), byteSize: bytes };
};

try {
  await mkdir(outputDir, { recursive: true });
  const source = await signDownload({ key: masterKey, expiresIn: 900 });
  const response = await fetch(source.url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`OCI master download failed (${response.status})`);
  await pipeline(response.body, createWriteStream(sourcePath));

  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  await execFile(ffmpeg, [
    "-nostdin", "-hide_banner", "-y", "-i", sourcePath,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
    "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
    "-hls_segment_filename", path.join(outputDir, "segment-%05d.ts"),
    path.join(outputDir, "index.m3u8"),
  ], { timeout: Number(process.env.FFMPEG_TIMEOUT_MS || 21_600_000), maxBuffer: 4 * 1024 * 1024 });

  const names = (await readdir(outputDir)).sort();
  if (!names.includes("index.m3u8") || !names.some((name) => name.endsWith(".ts"))) {
    throw new Error("FFmpeg did not produce a VOD HLS manifest and media segments");
  }
  const playlist = await readFile(path.join(outputDir, "index.m3u8"), "utf8");
  if (!playlist.startsWith("#EXTM3U") || !playlist.includes("#EXT-X-ENDLIST")) {
    throw new Error("HLS manifest is not a completed VOD playlist");
  }
  const objects = [];
  for (const name of names) {
    if (!/^(index\.m3u8|segment-[0-9]{5}\.ts)$/.test(name)) {
      throw new Error(`Unexpected packaging output: ${name}`);
    }
    const file = path.join(outputDir, name);
    const contentType = name.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t";
    const objectKey = `${prefix}/${name}`;
    const local = await hashFile(file);
    const upload = await signUpload({ key: objectKey, contentType, expiresIn: 900 });
    const put = await fetch(upload.url, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: createReadStream(file),
      duplex: "half",
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    if (!put.ok) throw new Error(`OCI rendition upload failed for ${name} (${put.status})`);
    const verified = await verifyObjectSha256(objectKey, local.sha256, local.byteSize);
    objects.push({ key: objectKey, contentType, ...verified });
  }

  const manifest = objects.find((object) => object.key.endsWith("/index.m3u8"));
  if (!manifest || !manifest.verified || objects.length < 2) {
    throw new Error("Primary HLS manifest or verified media segments are missing");
  }
  // Evidence only. A separate reviewed server-side registration operation is required
  // before Bridge migration 0013 can mark this rendition VERIFIED.
  process.stdout.write(JSON.stringify({
    schema: "crayons.bridge.hls-rendition-evidence.v1",
    titleId,
    protocol: "HLS",
    status: "PACKAGED_AND_OBJECTS_VERIFIED",
    manifestKey: manifest.key,
    manifestSha256: manifest.sha256,
    objects,
    registryWritePerformed: false,
    generatedAt: new Date().toISOString(),
  }, null, 2) + "\n");
} finally {
  await rm(workDir, { recursive: true, force: true });
}
