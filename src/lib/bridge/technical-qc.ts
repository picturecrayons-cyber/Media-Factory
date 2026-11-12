/**
 * Deterministic technical-QC report evaluator.
 *
 * This module deliberately consumes probe output; it does not download assets,
 * execute FFmpeg, mutate Bridge lifecycle state, or approve artistic/legal QC.
 * A trusted isolated worker must produce the probe payload before this can be
 * connected to the Bridge workflow.
 */

export type TechnicalQcStatus = "PASS" | "FAIL" | "REVIEW_REQUIRED";
export type TechnicalQcSeverity = "ERROR" | "WARNING" | "INFO";

export interface TechnicalQcFinding {
  code: string;
  severity: TechnicalQcSeverity;
  message: string;
  observed?: string | number | null;
  expected?: string | number | null;
}

export interface TechnicalQcProbe {
  format?: {
    duration?: string | number;
    format_name?: string;
    size?: string | number;
    bit_rate?: string | number;
  };
  streams?: Array<{
    index?: number;
    codec_type?: string;
    codec_name?: string;
    profile?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    sample_aspect_ratio?: string;
    display_aspect_ratio?: string;
    pix_fmt?: string;
    channels?: number;
    channel_layout?: string;
    sample_rate?: string;
    tags?: Record<string, string>;
  }>;
}

export interface TechnicalQcPolicy {
  minDurationSeconds: number;
  maxDurationSeconds: number;
  minWidth: number;
  minHeight: number;
  allowedVideoCodecs: readonly string[];
  allowedAudioCodecs: readonly string[];
  minFrameRate: number;
  maxFrameRate: number;
  requireAudio: boolean;
}

export interface TechnicalQcReport {
  schemaVersion: 1;
  engine: "bridge-technical-qc-evaluator";
  engineVersion: "0.1.0";
  status: TechnicalQcStatus;
  generatedAt: string;
  assetId: string;
  policyId: string;
  probeSource: "ffprobe";
  summary: {
    videoStreams: number;
    audioStreams: number;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
    frameRate: number | null;
  };
  findings: TechnicalQcFinding[];
  limitations: string[];
}

export const DEFAULT_TECHNICAL_QC_POLICY: TechnicalQcPolicy = {
  minDurationSeconds: 1,
  maxDurationSeconds: 60 * 60 * 8,
  minWidth: 640,
  minHeight: 360,
  allowedVideoCodecs: ["h264", "hevc", "av1", "prores"],
  allowedAudioCodecs: ["aac", "ac3", "eac3", "pcm_s16le", "pcm_s24le", "flac"],
  minFrameRate: 10,
  maxFrameRate: 120,
  requireAudio: true,
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseFrameRate(value: unknown): number | null {
  if (typeof value !== "string") return finiteNumber(value);
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const rate = numerator / denominator;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function finding(
  code: string,
  severity: TechnicalQcSeverity,
  message: string,
  observed?: string | number | null,
  expected?: string | number | null,
): TechnicalQcFinding {
  return { code, severity, message, observed, expected };
}

export function evaluateTechnicalQc(input: {
  assetId: string;
  policyId: string;
  probe: TechnicalQcProbe;
  policy?: TechnicalQcPolicy;
  generatedAt?: string;
}): TechnicalQcReport {
  const policy = input.policy ?? DEFAULT_TECHNICAL_QC_POLICY;
  const streams = Array.isArray(input.probe.streams) ? input.probe.streams : [];
  const video = streams.filter((stream) => stream.codec_type === "video");
  const audio = streams.filter((stream) => stream.codec_type === "audio");
  const primaryVideo = video[0];
  const primaryAudio = audio[0];
  const durationSeconds = finiteNumber(input.probe.format?.duration);
  const width = finiteNumber(primaryVideo?.width);
  const height = finiteNumber(primaryVideo?.height);
  const frameRate = parseFrameRate(primaryVideo?.avg_frame_rate) ?? parseFrameRate(primaryVideo?.r_frame_rate);
  const videoCodec = primaryVideo?.codec_name ?? null;
  const audioCodec = primaryAudio?.codec_name ?? null;
  const findings: TechnicalQcFinding[] = [];

  if (!primaryVideo) findings.push(finding("VIDEO_STREAM_MISSING", "ERROR", "No video stream was detected."));
  if (primaryVideo && (!width || !height)) findings.push(finding("VIDEO_DIMENSIONS_MISSING", "ERROR", "Video dimensions are missing."));
  if (width !== null && width < policy.minWidth) findings.push(finding("VIDEO_WIDTH_BELOW_MINIMUM", "ERROR", "Video width is below policy minimum.", width, policy.minWidth));
  if (height !== null && height < policy.minHeight) findings.push(finding("VIDEO_HEIGHT_BELOW_MINIMUM", "ERROR", "Video height is below policy minimum.", height, policy.minHeight));
  if (videoCodec && !policy.allowedVideoCodecs.includes(videoCodec)) findings.push(finding("VIDEO_CODEC_NOT_ALLOWED", "ERROR", "Video codec is not allowed by the selected policy.", videoCodec, policy.allowedVideoCodecs.join(", ")));
  if (primaryVideo && frameRate === null) findings.push(finding("FRAME_RATE_UNREADABLE", "ERROR", "A valid video frame rate could not be read."));
  if (frameRate !== null && (frameRate < policy.minFrameRate || frameRate > policy.maxFrameRate)) findings.push(finding("FRAME_RATE_OUT_OF_RANGE", "ERROR", "Frame rate is outside the selected policy.", frameRate, `${policy.minFrameRate}-${policy.maxFrameRate}`));
  if (durationSeconds === null) findings.push(finding("DURATION_UNREADABLE", "ERROR", "Media duration could not be read."));
  if (durationSeconds !== null && (durationSeconds < policy.minDurationSeconds || durationSeconds > policy.maxDurationSeconds)) findings.push(finding("DURATION_OUT_OF_RANGE", "ERROR", "Media duration is outside the selected policy.", durationSeconds, `${policy.minDurationSeconds}-${policy.maxDurationSeconds}`));
  if (policy.requireAudio && audio.length === 0) findings.push(finding("AUDIO_STREAM_MISSING", "ERROR", "The selected policy requires an audio stream."));
  if (audioCodec && !policy.allowedAudioCodecs.includes(audioCodec)) findings.push(finding("AUDIO_CODEC_NOT_ALLOWED", "ERROR", "Audio codec is not allowed by the selected policy.", audioCodec, policy.allowedAudioCodecs.join(", ")));

  if (video.length > 1) findings.push(finding("MULTIPLE_VIDEO_STREAMS", "WARNING", "Multiple video streams were detected; confirm the intended programme stream.", video.length, 1));
  if (audio.length > 1) findings.push(finding("MULTIPLE_AUDIO_STREAMS", "INFO", "Multiple audio streams were detected and require track/language review.", audio.length));
  if (!input.probe.format?.format_name) findings.push(finding("CONTAINER_FORMAT_UNREADABLE", "ERROR", "Container format could not be read."));

  const hasErrors = findings.some((item) => item.severity === "ERROR");
  const hasWarnings = findings.some((item) => item.severity === "WARNING");
  const status: TechnicalQcStatus = hasErrors ? "FAIL" : hasWarnings ? "REVIEW_REQUIRED" : "PASS";

  return {
    schemaVersion: 1,
    engine: "bridge-technical-qc-evaluator",
    engineVersion: "0.1.0",
    status,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    assetId: input.assetId,
    policyId: input.policyId,
    probeSource: "ffprobe",
    summary: {
      videoStreams: video.length,
      audioStreams: audio.length,
      durationSeconds,
      width: width ?? null,
      height: height ?? null,
      videoCodec,
      audioCodec,
      frameRate,
    },
    findings,
    limitations: [
      "This report validates probe metadata only; it does not inspect decoded frames or audio samples.",
      "Black-frame, freeze-frame, corruption, loudness, clipping, audio/video sync and subtitle sync checks are not implemented in this evaluator.",
      "A PASS is not artistic approval, legal approval, rights clearance, publication authorization or delivery readiness.",
      "The probe must be generated by a trusted isolated worker from the exact immutable verified asset version.",
    ],
  };
}
