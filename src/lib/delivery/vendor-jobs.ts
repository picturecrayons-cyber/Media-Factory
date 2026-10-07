/**
 * Vendor delivery jobs. Requests only — never auto-certified masters.
 * Dolby encode, IMF, and DCP stay blocked until a licensed vendor and a human sign-off.
 */

export const VENDOR_JOB_TYPES = [
  "dubbing",
  "loudness_check",
  "imf_request",
  "dcp_request",
  "human_qc",
] as const;

export type VendorJobType = (typeof VENDOR_JOB_TYPES)[number];

export const JOB_STATES = [
  "requested",
  "quoted",
  "payment_pending",
  "paid",
  "in_review",
  "blocked",
  "signed_off",
  "delivered",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export type VendorJob = {
  id: string;
  type: VendorJobType;
  state: JobState;
  titleId: string;
  note: string;
};

const OPEN_STATE: JobState = "requested";

export function createVendorJob(
  type: VendorJobType,
  titleId: string,
  note = "",
): VendorJob {
  if (!VENDOR_JOB_TYPES.includes(type)) {
    throw new Error("unknown_job_type");
  }
  if (!titleId.trim()) {
    throw new Error("title_required");
  }
  return {
    id: `job_${type}_${Date.now()}`,
    type,
    state: OPEN_STATE,
    titleId: titleId.trim(),
    note,
  };
}

/** Paid does not mean approved. Delivery needs human or vendor sign-off. */
export function canDeliver(job: VendorJob): boolean {
  return job.state === "signed_off";
}

export function markSignedOff(job: VendorJob, reviewer: string): VendorJob {
  if (!reviewer.trim()) {
    throw new Error("reviewer_required");
  }
  if (job.state !== "in_review" && job.state !== "paid") {
    throw new Error("not_ready_for_signoff");
  }
  return { ...job, state: "signed_off", note: `${job.note} signed_off:${reviewer.trim()}`.trim() };
}
