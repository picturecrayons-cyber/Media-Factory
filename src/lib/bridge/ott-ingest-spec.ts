export type OttIngestKind = "master" | "poster" | "poster_vertical" | "poster_horizontal" | "thumbnail" | "subtitle" | "screener" | "technical" | "censor_certificate";

type OttIngestRule = {
  label: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  mimeByExtension: Readonly<Record<string, readonly string[]>>;
  maxBytes: number;
};

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

export const OTT_INGEST_SPEC: Record<OttIngestKind, OttIngestRule> = {
  master: {
    label: "Master Video",
    maxBytes: 49 * GiB,
    extensions: [".mp4", ".mov", ".mxf"],
    mimeTypes: ["video/mp4", "video/quicktime", "application/mxf", "video/mxf"],
    mimeByExtension: {
      ".mp4": ["video/mp4"],
      ".mov": ["video/quicktime"],
      ".mxf": ["application/mxf", "video/mxf"],
    },
  },
  poster: {
    label: "Artwork",
    maxBytes: 25 * MiB,
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    mimeByExtension: {
      ".png": ["image/png"],
      ".jpg": ["image/jpeg"],
      ".jpeg": ["image/jpeg"],
      ".webp": ["image/webp"],
    },
  },
  poster_vertical: {
    label: "Vertical Poster",
    maxBytes: 25 * MiB,
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    mimeByExtension: {
      ".png": ["image/png"],
      ".jpg": ["image/jpeg"],
      ".jpeg": ["image/jpeg"],
      ".webp": ["image/webp"],
    },
  },
  poster_horizontal: {
    label: "Horizontal Artwork",
    maxBytes: 25 * MiB,
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    mimeByExtension: {
      ".png": ["image/png"],
      ".jpg": ["image/jpeg"],
      ".jpeg": ["image/jpeg"],
      ".webp": ["image/webp"],
    },
  },
  thumbnail: {
    label: "Thumbnail",
    maxBytes: 25 * MiB,
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    mimeByExtension: {
      ".png": ["image/png"],
      ".jpg": ["image/jpeg"],
      ".jpeg": ["image/jpeg"],
      ".webp": ["image/webp"],
    },
  },
  subtitle: {
    label: "Subtitle",
    maxBytes: 50 * MiB,
    extensions: [".srt", ".vtt", ".ttml", ".xml"],
    mimeTypes: [
      "application/x-subrip",
      "text/srt",
      "text/vtt",
      "application/ttml+xml",
      "application/xml",
      "text/xml",
    ],
    mimeByExtension: {
      ".srt": ["application/x-subrip", "text/srt"],
      ".vtt": ["text/vtt"],
      ".ttml": ["application/ttml+xml", "application/xml", "text/xml"],
      ".xml": ["application/ttml+xml", "application/xml", "text/xml"],
    },
  },
  screener: {
    label: "Trailer / Screener",
    maxBytes: 49 * GiB,
    extensions: [".mp4", ".mov", ".mxf"],
    mimeTypes: ["video/mp4", "video/quicktime", "application/mxf", "video/mxf"],
    mimeByExtension: {
      ".mp4": ["video/mp4"],
      ".mov": ["video/quicktime"],
      ".mxf": ["application/mxf", "video/mxf"],
    },
  },
  censor_certificate: {
    label: "Censor Certificate",
    maxBytes: 50 * MiB,
    extensions: [".pdf", ".png", ".jpg", ".jpeg"],
    mimeTypes: ["application/pdf", "image/png", "image/jpeg"],
    mimeByExtension: {
      ".pdf": ["application/pdf"],
      ".png": ["image/png"],
      ".jpg": ["image/jpeg"],
      ".jpeg": ["image/jpeg"],
    },
  },
  technical: {
    label: "Technical / Camera Package",
    maxBytes: 1 * GiB,
    extensions: [".cube", ".aml", ".xml", ".pkg"],
    mimeTypes: [
      "application/octet-stream",
      "application/xml",
      "text/xml",
      "text/plain",
    ],
    mimeByExtension: {
      ".cube": ["text/plain"],
      ".aml": ["application/octet-stream"],
      ".xml": ["application/xml", "text/xml"],
      ".pkg": ["application/octet-stream"],
    },
  },
};

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

export function getOttIngestAccept(kind: OttIngestKind): string {
  const rule = OTT_INGEST_SPEC[kind];
  return [...rule.extensions, ...rule.mimeTypes].join(",");
}

export function validateOttIngestFile(args: {
  kind: OttIngestKind;
  filename: string;
  contentType?: string | null;
  byteSize?: number;
}): { ok: true } | { ok: false; message: string } {
  const rule = OTT_INGEST_SPEC[args.kind];
  const extension = extensionOf(args.filename);
  const contentType = (args.contentType ?? "").toLowerCase();

  if (args.byteSize !== undefined && (!Number.isSafeInteger(args.byteSize) || args.byteSize <= 0)) {
    return { ok: false, message: "The selected file is empty or has an invalid size." };
  }
  if (args.byteSize !== undefined && args.byteSize > rule.maxBytes) {
    const maxLabel = rule.maxBytes >= GiB
      ? `${rule.maxBytes / GiB} GiB`
      : `${rule.maxBytes / MiB} MiB`;
    return { ok: false, message: `${rule.label} exceeds the ${maxLabel} upload limit.` };
  }

  if (!rule.extensions.includes(extension)) {
    return {
      ok: false,
      message: `${rule.label} must use one of: ${rule.extensions.join(", ")}`,
    };
  }

  if (contentType && contentType !== "application/octet-stream") {
    const allowedForExtension = rule.mimeByExtension[extension] ?? [];
    if (!allowedForExtension.includes(contentType)) {
      return {
        ok: false,
        message: `${rule.label} file type does not match its file extension.`,
      };
    }
  }

  return { ok: true };
}
