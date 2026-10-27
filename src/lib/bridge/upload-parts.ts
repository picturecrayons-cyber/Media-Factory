import { abortSimpleUpload } from "@/lib/bridge/simple-desk";

const SMALL = 200 * 1024 * 1024;
const LARGE = new Set(["master", "trailer", "screener", "audio", "audio_dub", "audio_description"]);

export function uploadLimit(kind: string) {
  return LARGE.has(kind) ? 8 * 1024 * 1024 * 1024 : SMALL;
}

type Progress = { loaded: number; total: number; secondsLeft: number | null };

function putBlob(url: string, body: Blob, contentType: string, signal: AbortSignal, onLoaded: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const xhr = new XMLHttpRequest();
    const stop = () => xhr.abort();
    signal.addEventListener("abort", stop, { once: true });
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onLoaded(event.loaded);
    };
    xhr.onload = () => {
      signal.removeEventListener("abort", stop);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Saving stopped."));
    };
    xhr.onerror = () => reject(new Error("Saving stopped."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    xhr.send(body);
  });
}

export async function sendFile(opts: {
  file: File;
  signal: AbortSignal;
  prepare: () => Promise<{ url: string; path: string; partBase: string | null; partBytes: number }>;
  confirm: (input: { path: string; partBase?: string }) => Promise<unknown>;
  onProgress: (progress: Progress) => void;
}) {
  const started = performance.now();
  const report = (loaded: number) => {
    const seconds = Math.max(1, (performance.now() - started) / 1000);
    const speed = loaded / seconds;
    opts.onProgress({
      loaded,
      total: opts.file.size,
      secondsLeft: speed > 0 ? Math.round((opts.file.size - loaded) / speed) : null,
    });
  };

  let partBase: string | null = null;
  let committed = false;
  try {
    if (opts.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const prepared = await opts.prepare();
    partBase = prepared.partBase;
    if (!partBase) {
      await putBlob(prepared.url, opts.file, opts.file.type || "application/octet-stream", opts.signal, report);
      await opts.confirm({ path: prepared.path });
      committed = true;
      return;
    }
    const size = prepared.partBytes;
    const parts = Math.ceil(opts.file.size / size);
    let loaded = 0;
    for (let part = 0; part < parts; part += 1) {
      if (opts.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const start = part * size;
      const blob = opts.file.slice(start, Math.min(start + size, opts.file.size));
      let partLoaded = 0;
      await putBlob(`${partBase}${part + 1}`, blob, "application/octet-stream", opts.signal, (sent) => {
        partLoaded = sent;
        report(loaded + sent);
      });
      loaded += partLoaded || blob.size;
      report(loaded);
    }
    await opts.confirm({ path: prepared.path, partBase });
    committed = true;
  } catch (error) {
    if (!committed && partBase) {
      try {
        await abortSimpleUpload({ data: { partBase } });
      } catch {
        // The unused parts are cleared on the next save of this slot.
      }
    }
    throw error;
  }
}
