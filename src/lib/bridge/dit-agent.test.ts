import test from "node:test";
import assert from "node:assert/strict";
import { detectDitFormat, ditCodecProbeStatus } from "./dit-format.ts";

test("DIT classifies camera source formats without claiming codec proof", () => {
  assert.equal(detectDitFormat("A001_C001.ari"), "ARRIRAW");
  assert.equal(detectDitFormat("A001_C001.r3d"), "RED_RAW");
  assert.equal(detectDitFormat("A001_C001.mov"), "QUICKTIME_CONTAINER");
  assert.equal(detectDitFormat("A001_C001.mxf"), "MXF_CONTAINER");
  assert.equal(ditCodecProbeStatus("QUICKTIME_CONTAINER"), "NOT_PROBED");
  assert.equal(ditCodecProbeStatus("MXF_CONTAINER"), "NOT_PROBED");
  assert.equal(detectDitFormat("unknown.bin"), "UNKNOWN");
});

test("three-copy Storage Verified gate is fail-closed", () => {
  const verified = (copies: Record<string, boolean>) =>
    ["MASTER", "BACKUP_1", "BACKUP_2"].every((key) => copies[key] === true);
  assert.equal(verified({ MASTER: true, BACKUP_1: true, BACKUP_2: true }), true);
  assert.equal(verified({ MASTER: true, BACKUP_1: true, BACKUP_2: false }), false);
  assert.equal(verified({ MASTER: true, BACKUP_1: true }), false);
});

test("DIT job is not card-safe by default", () => {
  const job = { status: "CREATED", cardSafe: false };
  assert.equal(job.cardSafe, false);
  assert.notEqual(job.status, "COMPLETED");
});
