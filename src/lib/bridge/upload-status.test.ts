import test from "node:test";
import assert from "node:assert/strict";
import { createUploadSnapshot, evaluateUploadStall, formatUploadBytes, recordTransferProgress, setUploadStage } from "./upload-status.ts";

test("preparation begins without fabricated transfer progress", () => {
  const state = createUploadSnapshot("feature-film.mov", 1000);
  assert.equal(state.stage, "preparing");
  assert.equal(state.loaded, 0);
  assert.equal(state.bytesPerSecond, null);
  assert.equal(state.etaSeconds, null);
});

test("transfer progress measures speed only across timed byte deltas", () => {
  const start = createUploadSnapshot("film.mov", 1000);
  const first = recordTransferProgress(start, 200, 1000, 1000);
  assert.equal(first.loaded, 200);
  assert.equal(first.etaSeconds, null);
  const second = recordTransferProgress(first, 600, 1000, 3000);
  assert.equal(second.bytesPerSecond, 200);
  assert.equal(second.etaSeconds, 2);
});

test("stall clears stale speed and ETA without inventing completion", () => {
  const transfer = recordTransferProgress(createUploadSnapshot("film.mov", 1000), 200, 1000, 1000);
  const stalled = evaluateUploadStall(transfer, 17000);
  assert.equal(stalled.stage, "stalled");
  assert.equal(stalled.bytesPerSecond, null);
  assert.equal(stalled.etaSeconds, null);
  assert.equal(stalled.loaded, 200);
});

test("verification and completion are explicit independent stages", () => {
  const transfer = recordTransferProgress(createUploadSnapshot("film.mov", 1000), 1000, 1000, 1000);
  assert.equal(transfer.stage, "transferring");
  const verifying = setUploadStage(transfer, "verifying", "Verifying uploaded bytes and sealed copy…");
  assert.equal(verifying.stage, "verifying");
  assert.notEqual(verifying.stage, "complete");
  assert.equal(setUploadStage(verifying, "complete", "Master verified.").stage, "complete");
});

test("failures are explicit and byte formatting is safe", () => {
  assert.equal(setUploadStage(createUploadSnapshot("film.mov", 10), "failed", "Upload failed").stage, "failed");
  assert.equal(formatUploadBytes(0), "0 B");
  assert.equal(formatUploadBytes(Number.NaN), "—");
});

test("accessibility contract uses announced status and progress semantics in UI", () => {
  const source = (await import("node:fs")).readFileSync("src/routes/title.$id.tsx", "utf8");
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="progressbar"/);
  assert.match(source, /aria-valuenow=/);
});
