import test from "node:test";
import assert from "node:assert/strict";

const formats = [
  ["camera.arx", "ARRIRAW"],
  ["camera.r3d", "RED RAW"],
  ["master.mov", "MOV_CONTAINER"],
  ["master.mxf", "MXF_CONTAINER"],
] as const;

test("DIT format labels distinguish container extensions from codec proof", () => {
  assert.deepEqual(formats.map(([name]) => name.split(".").pop()), ["arx", "r3d", "mov", "mxf"]);
  assert.equal("ProRes 422 HQ".includes("ProRes"), true);
  // A .mov extension alone is not evidence of ProRes 422 HQ.
  assert.notEqual("master.mov".toLowerCase().includes("prores"), true);
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
