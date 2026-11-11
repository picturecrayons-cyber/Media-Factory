export type DitFormat = "ARRIRAW" | "RED_RAW" | "QUICKTIME_CONTAINER" | "MXF_CONTAINER" | "MPEG4_CONTAINER" | "WAVE_AUDIO" | "BLACKMAGIC_RAW" | "CANON_RAW" | "SIDECAR" | "UNKNOWN";

const FORMAT_BY_EXTENSION: Record<string, DitFormat> = {
  ".ari": "ARRIRAW", ".r3d": "RED_RAW", ".mov": "QUICKTIME_CONTAINER",
  ".mxf": "MXF_CONTAINER", ".mp4": "MPEG4_CONTAINER", ".wav": "WAVE_AUDIO",
  ".braw": "BLACKMAGIC_RAW", ".crm": "CANON_RAW", ".xml": "SIDECAR",
  ".ale": "SIDECAR", ".csv": "SIDECAR", ".json": "SIDECAR", ".srt": "SIDECAR",
};

export function detectDitFormat(fileName: string): DitFormat {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "UNKNOWN" : FORMAT_BY_EXTENSION[fileName.slice(dot).toLowerCase()] ?? "UNKNOWN";
}

export function ditCodecProbeStatus(format: DitFormat) {
  return format === "QUICKTIME_CONTAINER" || format === "MXF_CONTAINER" || format === "MPEG4_CONTAINER"
    ? "NOT_PROBED" as const
    : "NOT_APPLICABLE_OR_NOT_PROBED" as const;
}
