import { useEffect, useState } from "react";

type Job = {
  id: string;
  label: string;
  loaded: number;
  total: number;
  secondsLeft: number | null;
  status: "waiting" | "saving" | "saved" | "stopped";
};

type Runner = {
  id: string;
  status: Job["status"];
  run: (ctx: { signal: AbortSignal; onProgress: (progress: { loaded: number; total: number; secondsLeft: number | null }) => void }) => Promise<void>;
  onDone?: () => void;
  onFail?: () => void;
};

const jobs: Job[] = [];
const runners = new Map<string, Runner>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let active = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

function timeLeft(seconds: number | null) {
  if (seconds == null || seconds < 5) return "";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return ` · ${minutes} min`;
}

async function pump() {
  while (active < 2) {
    const next = jobs.find((job) => job.status === "waiting");
    const runner = next ? runners.get(next.id) : undefined;
    if (!next || !runner) return;
    active += 1;
    next.status = "saving";
    const controller = new AbortController();
    controllers.set(next.id, controller);
    emit();
    void runner.run({
      signal: controller.signal,
      onProgress: (progress) => {
        next.loaded = progress.loaded;
        next.total = progress.total;
        next.secondsLeft = progress.secondsLeft;
        emit();
      },
    }).then(() => {
      next.status = "saved";
      next.loaded = next.total;
      runner.onDone?.();
      const index = jobs.indexOf(next);
      if (index >= 0) jobs.splice(index, 1);
    }).catch((error: unknown) => {
      next.status = "stopped";
      if (!(error instanceof DOMException && error.name === "AbortError")) runner.onFail?.();
    }).finally(() => {
      controllers.delete(next.id);
      runners.delete(next.id);
      active -= 1;
      emit();
      void pump();
    });
  }
}

export function enqueueUpload(input: {
  label: string;
  file: File;
  run: Runner["run"];
  onDone?: () => void;
  onFail?: () => void;
}) {
  const id = crypto.randomUUID();
  jobs.unshift({
    id,
    label: input.label,
    loaded: 0,
    total: input.file.size,
    secondsLeft: null,
    status: "waiting",
  });
  runners.set(id, { id, status: "waiting", run: input.run, onDone: input.onDone, onFail: input.onFail });
  emit();
  void pump();
  return id;
}

export function cancelUpload(id: string) {
  const job = jobs.find((item) => item.id === id);
  if (!job || job.status === "saved" || job.status === "stopped") return;
  if (job.status === "waiting") {
    job.status = "stopped";
    runners.delete(id);
    emit();
    return;
  }
  controllers.get(id)?.abort();
}

export function hideFinished() {
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    if (jobs[index]?.status === "stopped" || jobs[index]?.status === "saved") jobs.splice(index, 1);
  }
  emit();
}

export function useUploadJobs() {
  const [state, setState] = useState<Job[]>(() => jobs.map((job) => ({ ...job })));
  useEffect(() => {
    const pull = () => setState(jobs.map((job) => ({ ...job })));
    listeners.add(pull);
    return () => {
      listeners.delete(pull);
    };
  }, []);
  return state;
}

export function UploadTray() {
  const jobs = useUploadJobs();
  const [open, setOpen] = useState(true);
  const live = jobs.filter((job) => job.status === "saving" || job.status === "waiting" || job.status === "stopped");
  if (!live.length) return null;
  const saving = live.filter((job) => job.status === "saving" || job.status === "waiting");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-20 right-4 z-50 rounded-full bg-[#102433] px-4 py-2 text-sm font-semibold text-white md:bottom-4">
        {saving.length ? `Saving ${saving.length}` : "Uploads"}
      </button>
    );
  }
  return (
    <section className="fixed inset-x-3 bottom-20 z-50 rounded-2xl border border-line bg-white p-3 shadow-lg md:inset-x-auto md:bottom-4 md:right-4 md:w-80">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Saving</p>
        <button type="button" onClick={() => { hideFinished(); setOpen(false); }} className="text-xs font-semibold">Hide</button>
      </div>
      <ul className="space-y-2">
        {live.slice(0, 4).map((job) => {
          const pct = Math.min(100, Math.round((job.loaded / Math.max(1, job.total)) * 100));
          return (
            <li key={job.id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{job.label}</span>
                {job.status === "saving" || job.status === "waiting" ? (
                  <button type="button" onClick={() => cancelUpload(job.id)} className="shrink-0 text-xs font-semibold">Cancel</button>
                ) : null}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e7edf2]">
                <div className="h-full bg-[#102433]" style={{ width: `${job.status === "stopped" ? pct : pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {job.status === "waiting" ? "Waiting. You can keep working." : job.status === "stopped" ? "Stopped. Nothing was kept." : `Saving. ${pct}%${timeLeft(job.secondsLeft)}. You can leave this page.`}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
