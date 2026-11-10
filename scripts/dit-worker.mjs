#!/usr/bin/env node
/**
 * Studio-side FFmpeg worker for Bridge DIT conversion jobs.
 * Requires FFmpeg + FFprobe installed locally; no paid transcoding service.
 * Configure only against a Preview environment explicitly bound to Testing DB.
 */
import { createWriteStream, createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostname } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const exec = promisify(execFile);
const base = (process.env.DIT_WORKER_BASE_URL || "").replace(/\/$/, "");
const token = process.env.DIT_WORKER_TOKEN || "";
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const workerId = process.env.DIT_WORKER_ID || `${hostname()}-${randomUUID().slice(0, 8)}`;
const once = process.env.DIT_WORKER_ONCE === "1";

if (!base || !token) throw new Error("DIT_WORKER_BASE_URL and DIT_WORKER_TOKEN are required");

async function api(payload) {
  const response = await fetch(`${base}/api/dit/worker`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `DIT worker API failed (${response.status})`);
  return body;
}

async function download(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4 * 60 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`Source download failed (${response.status})`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

async function upload(url, filename, contentType) {
  const file = await stat(filename);
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType, "content-length": String(file.size) },
    body: createReadStream(filename),
    duplex: "half",
    signal: AbortSignal.timeout(4 * 60 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`Converted asset upload failed (${response.status})`);
}

async function sha256(filename) {
  const hash = createHash("sha256");
  let byteSize = 0;
  for await (const chunk of createReadStream(filename)) {
    byteSize += chunk.length;
    hash.update(chunk);
  }
  return { byteSize, sha256: hash.digest("hex") };
}

async function probe(filename) {
  const { stdout } = await exec(ffprobe, [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height,profile",
    "-of", "json", filename,
  ], { maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0];
  if (!stream) throw new Error("FFprobe did not find a video stream");
  return { width: Number(stream.width), height: Number(stream.height), codec: String(stream.codec_name || "") };
}

async function processJob(job) {
  const directory = await mkdtemp(join(tmpdir(), "bridge-dit-"));
  const source = join(directory, "source.mov");
  const output = join(directory, `converted.${job.profile.container.toLowerCase()}`);
  try {
    await download(job.sourceUrl, source);
    const sourceEvidence = await sha256(source);
    if (sourceEvidence.sha256.toLowerCase() !== String(job.sourceSha256).toLowerCase()) {
      throw new Error("Downloaded RAW source SHA-256 does not match the verified Bridge manifest");
    }
    const { width, height, codec, container, outputType } = job.profile;
    const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
    const args = ["-y", "-i", source, "-map", "0:v:0", "-map", "0:a?", "-vf", filter];
    if (outputType === "Proxy") {
      args.push("-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "22", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-f", "mp4");
    } else {
      args.push("-c:v", "prores_ks", "-profile:v", codec.includes("LT") ? "1" : "3", "-c:a", "pcm_s16le", "-f", "mov");
    }
    args.push(output);
    await exec(ffmpeg, args, { maxBuffer: 4 * 1024 * 1024 });
    const metadata = await probe(output);
    if (metadata.width !== width || metadata.height !== height) throw new Error("FFprobe dimensions do not match the approved profile");
    if (outputType === "Proxy" && metadata.codec !== "h264") throw new Error("FFprobe codec is not H.264");
    if (outputType === "ProRes" && metadata.codec !== "prores") throw new Error("FFprobe codec is not ProRes");
    const contentType = container === "MP4" ? "video/mp4" : "video/quicktime";
    await Promise.all([upload(job.masterUploadUrl, output, contentType), upload(job.backupUploadUrl, output, contentType)]);
    const evidence = await sha256(output);
    await api({
      action: "complete",
      jobId: job.jobId,
      master: { ...evidence, ...metadata },
      backup1: { ...evidence, ...metadata },
    });
    process.stdout.write(`DIT conversion completed: ${job.jobId}\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  for (;;) {
    const claim = await api({ action: "claim", workerId });
    if (!claim.job) {
      if (once) return;
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    try {
      await processJob(claim.job);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown FFmpeg worker failure";
      await api({ action: "fail", jobId: claim.job.jobId, reason }).catch(() => undefined);
      process.stderr.write(`DIT conversion failed: ${claim.job.jobId}: ${reason}\n`);
    }
    if (once) return;
  }
}

main().catch((error) => {
  process.stderr.write(`DIT worker stopped: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
