import { useState } from "react";
import { getBearerToken } from "@/lib/auth/client";

const ASSET_KINDS = [
  { value: "main_film", label: "Main film", accept: "video/*" },
  { value: "trailer", label: "Trailer", accept: "video/*" },
  { value: "poster_vertical", label: "Vertical poster", accept: "image/*" },
  { value: "poster_horizontal", label: "Horizontal poster", accept: "image/*" },
  { value: "thumbnail", label: "Thumbnail", accept: "image/*" },
] as const;

type UploadState = {
  progress: number;
  status: "idle" | "uploading" | "uploaded" | "error";
  message?: string;
};

const initialState: UploadState = { progress: 0, status: "idle" };

type Props = { titleId: string };

/**
 * Mount this component only inside a RequireBridge allow="super_admin" route.
 * The upload API must independently authorize the session and verify storage
 * before it transitions any asset to ACTIVE.
 */
export default function SuperAdminDirectUpload({ titleId }: Props) {
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [states, setStates] = useState<Record<string, UploadState>>({});

  function setState(kind: string, patch: Partial<UploadState>) {
    setStates((current) => ({
      ...current,
      [kind]: { ...(current[kind] ?? initialState), ...patch },
    }));
  }

  function uploadFile(kind: (typeof ASSET_KINDS)[number]["value"]) {
    const file = files[kind];
    if (!file || !titleId) return;

    setState(kind, { progress: 0, status: "uploading", message: undefined });
    const body = new FormData();
    body.append("file", file);
    body.append("title_id", titleId);
    body.append("kind", kind);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/bridge/direct-upload");
    xhr.withCredentials = true;
    const token = await getBearerToken();
    if (!token) {
      setState(kind, { status: "error", message: "Sign in again to upload." });
      return;
    }
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setState(kind, { progress: Math.min(99, Math.round((event.loaded / event.total) * 100)) });
      }
    };

    xhr.onload = () => {
      let payload: { error?: string; verified?: boolean; storage_business_state?: string } = {};
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        // A non-JSON response is reported below without exposing server internals.
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        // 100% means the server accepted and verified the upload, not merely
        // that the browser finished sending bytes.
        if (payload.verified === true && payload.storage_business_state === "VERIFIED") {
          setState(kind, { progress: 100, status: "uploaded", message: "Uploaded and verified" });
        } else {
          setState(kind, {
            progress: 100,
            status: "error",
            message: "Upload received, but storage verification is not confirmed. Asset is not marked ACTIVE by the client.",
          });
        }
      } else {
        setState(kind, {
          status: "error",
          message: payload.error ?? `Upload failed (HTTP ${xhr.status}).`,
        });
      }
    };

    xhr.onerror = () => setState(kind, { status: "error", message: "Network error. Check connection and try again." });
    xhr.onabort = () => setState(kind, { status: "error", message: "Upload cancelled." });
    xhr.send(body);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Direct asset upload</h2>
        <p className="mt-1 text-sm text-slate-600">Choose a file for each asset type. Upload progress is shown independently.</p>
      </div>

      <div className="space-y-4">
        {ASSET_KINDS.map(({ value, label, accept }) => {
          const state = states[value] ?? initialState;
          const busy = state.status === "uploading";
          return (
            <div key={value} className="rounded-xl border border-slate-200 p-4">
              <label htmlFor={`asset-${value}`} className="block text-sm font-medium text-slate-800">{label}</label>
              <input
                id={`asset-${value}`}
                type="file"
                accept={accept}
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  setFiles((current) => ({ ...current, [value]: file }));
                  setState(value, { progress: 0, status: "idle", message: undefined });
                }}
                className="mt-2 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium file:text-slate-800 hover:file:bg-slate-200 disabled:opacity-50"
              />
              {files[value] && <p className="mt-2 truncate text-xs text-slate-500">{files[value]?.name}</p>}

              <div className="mt-3 flex items-center gap-3">
                <div
                  role="progressbar"
                  aria-label={`${label} upload progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={state.progress}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-150 ${state.status === "error" ? "bg-red-500" : state.status === "uploaded" ? "bg-emerald-600" : "bg-blue-600"}`}
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs tabular-nums text-slate-600">{state.progress}%</span>
              </div>

              {state.message && (
                <p role={state.status === "error" ? "alert" : "status"} className={`mt-2 text-xs ${state.status === "error" ? "text-red-700" : "text-emerald-700"}`}>
                  {state.message}
                </p>
              )}

              <button
                type="button"
                disabled={!files[value] || busy || !titleId}
                onClick={() => uploadFile(value)}
                className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Uploading…" : state.status === "uploaded" ? "Upload again" : "Upload"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
