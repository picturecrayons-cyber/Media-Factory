/**
 * Canonical vendor services marketplace domain contract.
 *
 * This module contains deterministic validation only. Persistence, authentication,
 * quote acceptance, payment verification, storage and sign-off must run server-side.
 * A requested job is not proof that a vendor has been assigned or that processing ran.
 */

export const VENDOR_JOB_TYPES = [
  "dubbing",
  "loudness_check",
  "imf_request",
  "dcp_request",
  "human_qc",
  "subtitles_localization",
  "audio_description",
  "color_finishing",
  "ott_delivery",
  "poster_campaign",
] as const;

export type VendorJobType = (typeof VENDOR_JOB_TYPES)[number];

export const JOB_STATES = [
  "requested",
  "quoted",
  "approved",
  "payment_pending",
  "paid",
  "processing",
  "human_review",
  "qc_inspection",
  "blocked",
  "rejected",
  "cancelled",
  "refund_required",
  "signed_off",
  "delivered",
] as const;

export type JobState = (typeof JOB_STATES)[number];
export type ServiceLane = "self_service" | "managed";
export type PaymentState = "unpaid" | "order_created" | "paid" | "failed" | "refund_pending" | "refunded";

export type VendorJob = {
  id: string;
  type: VendorJobType;
  state: JobState;
  titleId: string;
  note: string;
  serviceLane: ServiceLane;
  scope: Record<string, unknown>;
  paymentStatus: PaymentState;
  indicativeMinPaise: number | null;
  indicativeMaxPaise: number | null;
  deliverableAssetKey: string | null;
  signoffAt: string | null;
};

export type ServicePrice = {
  serviceType: VendorJobType;
  displayName: string;
  pricingUnit: string;
  minPaise: number | null;
  maxPaise: number | null;
  quoteRequired: boolean;
  priceBasis: "indicative_market_estimate";
  sourceUrl?: string;
};

export const SERVICE_PRICE_GUIDANCE: readonly ServicePrice[] = [
  {
    serviceType: "dubbing",
    displayName: "Dubbing",
    pricingUnit: "per_finished_minute",
    minPaise: 120_000,
    maxPaise: 600_000,
    quoteRequired: true,
    priceBasis: "indicative_market_estimate",
    sourceUrl: "https://justshoot.ai/blog/youtube-video-dubbing-cost-india-2026",
  },
  {
    serviceType: "loudness_check",
    displayName: "Basic loudness check + report (not a Dolby encode)",
    pricingUnit: "per_master",
    minPaise: 200_000,
    maxPaise: 850_000,
    quoteRequired: false,
    priceBasis: "indicative_market_estimate",
    sourceUrl: "https://tejasmedia.in/services",
  },
  {
    serviceType: "human_qc",
    displayName: "Human audio/video QC",
    pricingUnit: "per_master",
    minPaise: 500_000,
    maxPaise: 1_500_000,
    quoteRequired: true,
    priceBasis: "indicative_market_estimate",
    sourceUrl: "https://tejasmedia.in/services",
  },
  {
    serviceType: "dcp_request",
    displayName: "DCP 2K unencrypted",
    pricingUnit: "per_feature_film",
    minPaise: 1_000_000,
    maxPaise: 2_000_000,
    quoteRequired: true,
    priceBasis: "indicative_market_estimate",
    sourceUrl: "https://swastikafilms.com/blog/film-dcp-process-costing/dcp-making-process-costing-explained-for-filmmakers-in-india/",
  },
  {
    serviceType: "dcp_request",
    displayName: "DCP 4K / encryption / KDM scope",
    pricingUnit: "per_package",
    minPaise: 2_000_000,
    maxPaise: 4_000_000,
    quoteRequired: true,
    priceBasis: "indicative_market_estimate",
    sourceUrl: "https://realtouchstudios.com/pricing",
  },
  {
    serviceType: "imf_request",
    displayName: "IMF package",
    pricingUnit: "per_package",
    minPaise: 1_500_000,
    maxPaise: 5_000_000,
    quoteRequired: true,
    priceBasis: "indicative_market_estimate",
    sourceUrl: "https://www.qlab.in/book-online",
  },
];

const OPEN_STATE: JobState = "requested";

export function createVendorJob(
  type: VendorJobType,
  titleId: string,
  note = "",
  opts: { serviceLane?: ServiceLane; scope?: Record<string, unknown> } = {},
): Omit<VendorJob, "id" | "paymentStatus" | "indicativeMinPaise" | "indicativeMaxPaise" | "deliverableAssetKey" | "signoffAt"> {
  if (!VENDOR_JOB_TYPES.includes(type)) {
    throw new Error("unknown_job_type");
  }
  const normalizedTitleId = titleId.trim();
  if (!normalizedTitleId) throw new Error("title_required");
  return {
    type,
    state: OPEN_STATE,
    titleId: normalizedTitleId,
    note: note.trim(),
    serviceLane: opts.serviceLane ?? "managed",
    scope: opts.scope ?? {},
  };
}

/** Payment or an order ID never permits delivery. Signed-off deliverables are mandatory. */
export function canDeliver(job: Pick<VendorJob, "state" | "deliverableAssetKey" | "signoffAt">): boolean {
  return job.state === "delivered" && Boolean(job.deliverableAssetKey && job.signoffAt);
}

/** Only a signed-off job with an actual deliverable can transition to delivered. */
export function canMarkSignedOff(
  job: Pick<VendorJob, "state" | "paymentStatus" | "deliverableAssetKey">,
  reviewer: string,
): boolean {
  return Boolean(reviewer.trim()) &&
    (job.state === "human_review" || job.state === "qc_inspection" || job.state === "paid") &&
    job.paymentStatus === "paid" &&
    Boolean(job.deliverableAssetKey);
}

/** Currency calculations remain integer paise; totals are server-computed. */
export function quoteTotalPaise(vendorAmountPaise: number, bridgeFeePaise: number, taxAmountPaise: number): number {
  for (const amount of [vendorAmountPaise, bridgeFeePaise, taxAmountPaise]) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("invalid_quote_amount");
  }
  const total = vendorAmountPaise + bridgeFeePaise + taxAmountPaise;
  if (!Number.isSafeInteger(total)) throw new Error("quote_total_out_of_range");
  return total;
}
