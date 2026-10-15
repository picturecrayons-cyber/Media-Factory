export type MasterUploadStage = "preparing" | "transferring" | "stalled" | "verifying" | "refreshing" | "complete" | "failed";

export type MasterUploadSnapshot = {
  stage: MasterUploadStage;
  filename: string;
  fileSize: number;
  loaded: number;
  total: number | null;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
  lastProgressAt: number | null;
  message: string;
};

export function createUploadSnapshot(filename: string, fileSize: number): MasterUploadSnapshot {
  return { stage: "preparing", filename, fileSize, loaded: 0, total: null, bytesPerSecond: null, etaSeconds: null, lastProgressAt: null, message: "Preparing secure upload…" };
}

export function recordTransferProgress(state: MasterUploadSnapshot, loaded: number, total: number | null, now: number): MasterUploadSnapshot {
  const safeLoaded = Math.max(0, Math.min(Number.isFinite(loaded) ? loaded : 0, state.fileSize));
  const safeTotal = total != null && Number.isFinite(total) && total > 0 ? total : null;
  const elapsed = state.lastProgressAt == null ? 0 : Math.max(0, (now - state.lastProgressAt) / 1000);
  const delta = Math.max(0, safeLoaded - state.loaded);
  const speed = elapsed >= 1 && delta > 0 ? delta / elapsed : state.bytesPerSecond;
  const remaining = safeTotal == null ? null : Math.max(0, safeTotal - safeLoaded);
  const eta = speed != null && speed > 0 && remaining != null ? remaining / speed : null;
  return { ...state, stage: "transferring", loaded: safeLoaded, total: safeTotal, bytesPerSecond: speed, etaSeconds: eta, lastProgressAt: now, message: safeTotal == null ? "Transfer active; total size is not reported by the browser." : "Transferring film bytes…" };
}

export function evaluateUploadStall(state: MasterUploadSnapshot, now: number, stallAfterMs = 15000): MasterUploadSnapshot {
  if (state.stage !== "transferring" || state.lastProgressAt == null || now - state.lastProgressAt < stallAfterMs) return state;
  return { ...state, stage: "stalled", bytesPerSecond: null, etaSeconds: null, message: "No transfer progress has been reported recently. The connection may be stalled; do not restart unless the upload is confirmed failed." };
}

export function setUploadStage(state: MasterUploadSnapshot, stage: MasterUploadStage, message: string): MasterUploadSnapshot {
  return { ...state, stage, bytesPerSecond: null, etaSeconds: null, message };
}

export function formatUploadBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; value >= 1024 && i < units.length - 1; i++) { value /= 1024; unit = units[i]; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}
