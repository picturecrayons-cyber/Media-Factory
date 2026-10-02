export type OttIngestKind = "master" | "poster" | "subtitle" | "screener";

type OttIngestRule = {
  label: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  mimeByExtension: Readonly<Record<string, readonly string[]>>;
};

export const OTT_INGEST_SPEC: Record<OttIngestKind, OttIngestRule> = {
  master: {
    label: "Master Video",
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
    extensions: [".mp4", ".mov", ".mxf"],
    mimeTypes: ["video/mp4", "video/quicktime", "application/mxf", "video/mxf"],
    mimeByExtension: {
      ".mp4": ["video/mp4"],
      ".mov": ["video/quicktime"],
      ".mxf": ["application/mxf", "video/mxf"],
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
}): { ok: true } | { ok: false; message: string } {
  const rule = OTT_INGEST_SPEC[args.kind];
  const extension = extensionOf(args.filename);
  const contentType = (args.contentType ?? "").toLowerCase();

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
