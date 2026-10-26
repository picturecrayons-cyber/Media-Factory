const SMALL = 200 * 1024 * 1024;
const LARGE = new Set(["master", "trailer", "screener", "audio", "audio_dub", "audio_description"]);

export function uploadLimit(kind: string) {
  return LARGE.has(kind) ? 8 * 1024 * 1024 * 1024 : SMALL;
}

type Progress = { loaded: number; total: number; secondsLeft: number | null };

function putBlob(url: string, body: Blob, contentType: string, onLoaded: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onLoaded(event.loaded);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("The connection stopped. Choose the same file to resume."));
    xhr.send(body);
  });
}

function savedKey(resumeKey: string) {
  return `bridge-upload:${resumeKey}`;
}

export async function sendFile(opts: {
  file: File;
  resumeKey: string;
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

  const key = savedKey(opts.resumeKey);
  if (opts.file.size <= 16 * 1024 * 1024) {
    const prepared = await opts.prepare();
    await putBlob(prepared.url, opts.file, opts.file.type || "application/octet-stream", report);
    await opts.confirm({ path: prepared.path });
    return;
  }

  const stored = sessionStorage.getItem(key);
  let plan: { path: string; partBase: string; partBytes: number; done: number[] } | null = null;
  if (stored) {
    try {
      plan = JSON.parse(stored) as { path: string; partBase: string; partBytes: number; done: number[] };
    } catch {
      plan = null;
    }
  }
  if (!plan?.partBase) {
    const prepared = await opts.prepare();
    if (!prepared.partBase) throw new Error("Large upload was not split.");
    plan = { path: prepared.path, partBase: prepared.partBase, partBytes: prepared.partBytes, done: [] };
    sessionStorage.setItem(key, JSON.stringify(plan));
  }

  const partBase = plan.partBase;
  const size = plan.partBytes;
  const parts = Math.ceil(opts.file.size / size);
  let loaded = plan.done.reduce((sum, part) => sum + Math.min(size, opts.file.size - part * size), 0);
  report(loaded);
  for (let part = 0; part < parts; part += 1) {
    if (plan.done.includes(part)) continue;
    const start = part * size;
    const blob = opts.file.slice(start, Math.min(start + size, opts.file.size));
    let partLoaded = 0;
    await putBlob(`${partBase}${part + 1}`, blob, "application/octet-stream", (sent) => {
      partLoaded = sent;
      report(loaded + sent);
    });
    loaded += partLoaded || blob.size;
    plan.done.push(part);
    sessionStorage.setItem(key, JSON.stringify(plan));
    report(loaded);
  }
  await opts.confirm({ path: plan.path, partBase });
  sessionStorage.removeItem(key);
}
