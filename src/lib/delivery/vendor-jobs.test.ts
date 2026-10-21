import test from "node:test";
import assert from "node:assert/strict";
import { createVendorJob, canDeliver, markSignedOff, VENDOR_JOB_TYPES } from "./vendor-jobs.ts";

test("vendor job creation requires a non-empty canonical title ID", () => {
  assert.throws(() => createVendorJob("human_qc", ""), { message: "title_required" });
  assert.throws(() => createVendorJob("human_qc", "   "), { message: "title_required" });
  const job = createVendorJob("human_qc", "canonical-title-id");
  assert.equal(job.titleId, "canonical-title-id");
  assert.equal(job.state, "requested");
  assert.equal(canDeliver(job), false);
});

test("vendor job creation rejects unknown job types", () => {
  assert.throws(() => createVendorJob("unsupported" as never, "canonical-title-id"), { message: "unknown_job_type" });
});

test("delivery remains blocked until a permitted state is signed off", () => {
  const job = createVendorJob("human_qc", "canonical-title-id");
  assert.throws(() => markSignedOff(job, "reviewer-1"), { message: "not_ready_for_signoff" });
  assert.equal(VENDOR_JOB_TYPES.includes(job.type), true);
});
