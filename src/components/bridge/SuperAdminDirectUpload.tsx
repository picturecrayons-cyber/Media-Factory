import { useState } from "react";
import { getBearerToken } from "@/lib/auth/client";

const ASSET_KINDS = [
  { value: "main_film", label: "Main film", accept: "video/*" },
  { value: "trailer", label: "Trailer", accept: "video/*" },
  { value: "poster_vertical", label: "Vertical poster", accept: "image/*" },
  { value: "poster_horizontal", label: "Horizontal poster", accept: "image/*" },
  { value: "thumbnail", label: "Thumbnail", accept: "image/*" },
] as const;

type Kind = (typeof ASSET_KINDS)[number]["value"];
type UploadState = { progress: number; status: "idle" | "preparing" | "uploading" | "verifying" | "uploaded" | "error"; message?: string };
const initialState: UploadState = { progress: 0, status: "idle" };
type Props = { titleId: string };

async function authorizedJson(url: string, token: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `Request failed (HTTP ${response.status})`);
  return payload;
}

function putToOci(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(`OCI upload failed (HTTP ${xhr.status}). Check Preview-origin bucket CORS and PAR permissions.`));
    xhr.onerror = () => reject(new Error("OCI network/CORS error. Verify the Preview origin is allowed by the staging bucket."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

export default function SuperAdminDirectUpload({ titleId }: Props) {
  const [files, setFiles] = useState<Partial<Record<Kind, File>>>({});
  const [states, setStates] = useState<Partial<Record<Kind, UploadState>>>({});

  function setState(kind: Kind, patch: Partial<UploadState>) {
    setStates((current) => ({ ...current, [kind]: { ...(current[kind] ?? initialState), ...patch } }));
  }

  async function uploadFile(kind: Kind) {
    const file = files[kind];
    if (!file || !titleId) return;
    setState(kind, { progress: 0, status: "preparing", message: "Requesting short-lived OCI upload access…" });
    try {
      const token = await getBearerToken();
      if (!token) throw new Error("Sign in again to upload.");
      const reservation = await authorizedJson("/api/bridge/super-admin/par", token, {
        title_id: titleId,
        kind,
        filename: file.name,
        content_type: file.type || (kind === "main_film" || kind === "trailer" ? "video/mp4" : "application/octet-stream"),
        byte_size: file.size,
      });
      if (typeof reservation.parUrl !== "string" || typeof reservation.s3_key !== "string") {
        throw new Error("Server did not return a valid OCI upload reservation.");
      }

      setState(kind, { status: "uploading", message: "Uploading directly to OCI…" });
      await putToOci(reservation.parUrl, file, (progress) => setState(kind, { progress, status: "uploading" }));

      setState(kind, { progress: 99, status: "verifying", message: "Verifying OCI object and sealing immutable copy…" });
      const verified = await authorizedJson("/api/bridge/super-admin/verify", token, {
        s3_key: reservation.s3_key,
        byte_size: file.size,
      });
      if (verified.verified !== true || verified.storage_state !== "VERIFIED") {
        throw new Error("Server did not confirm verified storage state.");
      }
      setState(kind, { progress: 100, status: "uploaded", message: "Uploaded, verified and sealed." });
    } catch (error) {
      setState(kind, {
        status: "error",
        message: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Super-admin direct asset upload</h2>
        <p className="mt-1 text-sm text-slate-600">Files transfer directly from this browser to OCI; film bytes do not pass through the Vercel serverless route.</p>
      </div>
      <div className="space-y-4">
        {ASSET_KINDS.map(({ value, label, accept }) => {
          const state = states[value] ?? initialState;
          const busy = ["preparing", "uploading", "verifying"].includes(state.status);
          return (
            <div key={value} className="space-y-2 rounded-xl border border-slate-200 p-4">
              <label className="block text-sm font-medium text-slate-900" htmlFor={`asset-${value}`}>{label}</label>
              <input
                id={`asset-${value}`}
                type="file"
                accept={accept}
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  setFiles((current) => ({ ...current, [value]: file }));
                  setState(value, { progress: 0, status: "idle", message: undefined });
                }}
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2"
              />
              {files[value] && <p className="text-xs text-slate-500">{files[value]?.name} · {((files[value]?.size ?? 0) / (1024 * 1024)).toFixed(1)} MiB</p>}
              <div
                role="progressbar"
                aria-label={`${label} upload progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={state.progress}
                className="h-2 overflow-hidden rounded-full bg-slate-100"
              >
                <div className="h-full rounded-full bg-slate-700 transition-[width]" style={{ width: `${state.progress}%` }} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-xs ${state.status === "error" ? "text-red-700" : state.status === "uploaded" ? "text-emerald-700" : "text-slate-600"}`}>
                  {state.message ?? `${state.progress}%`}
                </p>
                <button type="button" disabled={!files[value] || busy} onClick={() => void uploadFile(value)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                  {busy ? "Working…" : state.status === "uploaded" ? "Upload again" : "Upload"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
