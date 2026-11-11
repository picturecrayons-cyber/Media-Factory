export type UploadQueueStatus = "pending" | "uploading" | "ready" | "failed";

export type UploadQueueItem = {
  id: string;
  identity: string;
  file: File;
  kind: "master" | "screener" | "poster_vertical" | "poster_horizontal" | "thumbnail" | "subtitle" | "censor_certificate";
  status: UploadQueueStatus;
};

type FileLike = { name: string; size: number; lastModified: number };

function extension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

export function uploadFileIdentity(file: FileLike) {
  return `${file.name.toLowerCase()}:${file.size}:${file.lastModified}`;
}

/** Deterministic first-pass mapping for a mixed drag/drop selection. */
export function classifyUploadFiles<T extends FileLike>(files: readonly T[]) {
  const used = new Set<string>();
  const seen = new Set<string>();
  const result: Array<{ file: T; kind: UploadQueueItem["kind"]; identity: string }> = [];
  const videoKinds: UploadQueueItem["kind"][] = ["master", "screener"];
  const imageKinds: UploadQueueItem["kind"][] = ["poster_vertical", "poster_horizontal", "thumbnail"];

  for (const file of files) {
    const identity = uploadFileIdentity(file);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const ext = extension(file.name);
    let kind: UploadQueueItem["kind"] | undefined;
    if ([".mp4", ".mov", ".mxf"].includes(ext)) kind = videoKinds.find((candidate) => !used.has(candidate));
    else if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) kind = imageKinds.find((candidate) => !used.has(candidate));
    else if ([".srt", ".vtt", ".ttml", ".xml"].includes(ext) && !used.has("subtitle")) kind = "subtitle";
    else if (ext === ".pdf" && !used.has("censor_certificate")) kind = "censor_certificate";
    if (!kind) continue;
    used.add(kind);
    result.push({ file, kind, identity });
  }
  return result;
}
