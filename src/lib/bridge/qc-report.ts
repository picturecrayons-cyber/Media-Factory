import { z } from "zod";

export const QC_CHECK_KEYS = [
  "video",
  "audio",
  "artwork",
  "subtitles",
  "certificate",
] as const;

export const QC_CHECK_LABELS: Record<(typeof QC_CHECK_KEYS)[number], string> = {
  video: "Video technical review",
  audio: "Audio technical review",
  artwork: "Artwork review",
  subtitles: "Subtitle review",
  certificate: "Censor certificate validation",
};

const qcCheckSchema = z.object({
  status: z.enum(["PASS", "FAIL", "NEEDS_REVIEW", "NOT_RUN"]),
  evidenceReference: z.string().trim().max(500).optional().default(""),
  finding: z.string().trim().max(2000).optional().default(""),
});

export const qcReportSchema = z.object({
  version: z.literal(1),
  checks: z.object({
    video: qcCheckSchema,
    audio: qcCheckSchema,
    artwork: qcCheckSchema,
    subtitles: qcCheckSchema,
    certificate: qcCheckSchema,
  }),
});

export type QcReport = z.infer<typeof qcReportSchema>;
export type QcCheckKey = (typeof QC_CHECK_KEYS)[number];

export function qcReportReadiness(report: QcReport) {
  const incomplete = QC_CHECK_KEYS.filter((key) => {
    const check = report.checks[key];
    return check.status !== "PASS" || !check.evidenceReference.trim();
  });
  return {
    ready: incomplete.length === 0,
    incomplete,
  };
}

/**
 * PASS is deliberately evidence-gated. A reviewer cannot approve QC merely
 * because assets exist or have an application-level "Ready" status.
 */
export function assertQcReportReadyForPass(report: QcReport) {
  const readiness = qcReportReadiness(report);
  if (!readiness.ready) {
    throw new Error(
      `QC PASS requires PASS plus an evidence reference for: ${readiness.incomplete.join(", ")}`,
    );
  }
}
