import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  createDitIngestSession,
  getDitWorkspace,
  recordDitCopyVerification,
  requestDitFileUpload,
  signOffDitIngestSession,
  verifyDitFileUpload,
} from "@/lib/bridge/dit-agent";

type StudioActor = {
  userId: string;
  displayName: string;
  organizationName?: string | null;
  organizationId?: string | null;
};
type ManifestDraft = {
  root?: string;
  files: Array<{ relativePath: string; byteSize: number; sha256: string }>;
};
type Attestations = { folders: boolean; names: boolean; card: boolean };

async function readManifest(file: File): Promise<ManifestDraft> {
  const value = JSON.parse(await file.text()) as Partial<ManifestDraft>;
  if (!Array.isArray(value.files)) throw new Error("The selected JSON is not a DIT manifest");
  return { root: typeof value.root === "string" ? value.root : undefined, files: value.files };
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function DitAgentDesk({ actor }: { actor: StudioActor }) {
  const queryClient = useQueryClient();
  const queryKey = ["bridge-dit-workspace", actor.userId, actor.organizationId];
  const workspace = useQuery({ queryKey, queryFn: () => getDitWorkspace() });
  const [titleId, setTitleId] = useState("");
  const [cameraUnit, setCameraUnit] = useState<"A" | "B" | "C">("A");
  const [cameraLabel, setCameraLabel] = useState("Main Camera");
  const [cardLabel, setCardLabel] = useState("");
  const [shootDate, setShootDate] = useState(new Date().toISOString().slice(0, 10));
  const [sourceVolume, setSourceVolume] = useState("");
  const [sourceRoot, setSourceRoot] = useState("");
  const [sourceManifest, setSourceManifest] = useState<ManifestDraft | null>(null);
  const [sourceMediaFiles, setSourceMediaFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [attestations, setAttestations] = useState<Record<string, Attestations>>({});
  const [signoffNotes, setSignoffNotes] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState("");

  const refresh = async () => queryClient.invalidateQueries({ queryKey });
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!sourceManifest) throw new Error("Select the source-card manifest first");
      if (!sourceMediaFiles.length) throw new Error("Select the original camera-card folder");
      const mediaByPath = new Map<string, File>();
      for (const file of sourceMediaFiles) {
        const rawPath = file.webkitRelativePath || file.name;
        const segments = rawPath.replaceAll("\\", "/").split("/").filter(Boolean);
        const relativePath = segments.length > 1 ? segments.slice(1).join("/") : rawPath;
        if (mediaByPath.has(relativePath)) throw new Error(`Duplicate selected camera file path: ${relativePath}`);
        mediaByPath.set(relativePath, file);
      }
      if (mediaByPath.size !== sourceManifest.files.length) {
        throw new Error("Selected camera folder file count does not match the registered manifest");
      }
      for (const entry of sourceManifest.files) {
        const file = mediaByPath.get(entry.relativePath);
        if (!file || file.size !== entry.byteSize) {
          throw new Error(`Camera file missing or size mismatch: ${entry.relativePath}`);
        }
      }

      const sessionId = activeSessionId ?? (await createDitIngestSession({ data: {
        titleId, cameraUnit, cameraLabel, cardLabel, shootDate, sourceVolume, sourceRoot,
        manifest: sourceManifest,
      } })).sessionId;
      if (!activeSessionId) setActiveSessionId(sessionId);
      setUploadProgress({ completed: 0, total: sourceManifest.files.length });

      let nextIndex = 0;
      let completed = 0;
      const worker = async () => {
        while (true) {
          const index = nextIndex++;
          const entry = sourceManifest.files[index];
          if (!entry) return;
          const file = mediaByPath.get(entry.relativePath);
          if (!file) throw new Error(`Camera file missing: ${entry.relativePath}`);
          const request = await requestDitFileUpload({ data: {
            sessionId: sessionId,
            relativePath: entry.relativePath,
          } });
          if (!request.alreadyUploaded) {
            const response = await fetch(request.upload.url, {
              method: "PUT",
              headers: { "content-type": "application/octet-stream" },
              body: file,
              redirect: "error",
            });
            if (!response.ok) throw new Error(`OCI Primary upload failed for ${entry.relativePath} (${response.status})`);
            await verifyDitFileUpload({ data: {
              sessionId: sessionId,
              relativePath: entry.relativePath,
            } });
          }
          completed += 1;
          setUploadProgress({ completed, total: sourceManifest.files.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, sourceManifest.files.length) }, () => worker()));

      for (const type of ["PRIMARY", "RECOVERY"] as const) {
        await recordDitCopyVerification({ data: {
          sessionId: sessionId,
          copyType: type,
          copyRoot: type === "PRIMARY" ? "OCI Primary Vault" : "OCI Recovery Vault",
          manifest: sourceManifest,
        } });
      }
      return { sessionId };
    },
    onSuccess: async () => {
      setSourceManifest(null);
      setSourceMediaFiles([]);
      setActiveSessionId(null);
      setUploadProgress(null);
      setCardLabel("");
      if (folderInputRef.current) folderInputRef.current.value = "";
      await refresh();
    },
    onError: async () => {
      setUploadProgress(null);
      await refresh();
    },
  });
  const signoffMutation = useMutation({
    mutationFn: (args: { sessionId: string; signoffNote: string }) =>
      signOffDitIngestSession({ data: {
        ...args,
        folderStructurePreserved: true,
        originalFilenamesPreserved: true,
        cameraCardRetained: true,
      } }),
    onSuccess: refresh,
  });

  const handleSourceFile = async (file?: File) => {
    if (!file) return;
    try {
      setFileError("");
      const manifest = await readManifest(file);
      setSourceManifest(manifest);
      if (!sourceRoot) setSourceRoot(manifest.root || file.name.replace(/\.json$/i, ""));
    } catch (error) {
      setSourceManifest(null);
      setFileError(error instanceof Error ? error.message : "Could not read the manifest");
    }
  };
  const handleSourceFolder = (files: FileList | null) => {
    setFileError("");
    setSourceMediaFiles(files ? Array.from(files) : []);
  };
  const sessions = workspace.data?.sessions ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">DIT ingest desk</h2>
            <p className="mt-1 text-sm text-muted">Camera-card inventory, checksum evidence and two-copy verification for {actor.organizationName || "this Studio"}.</p>
          </div>
          <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">Camera A / B / C</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Finished film</span>
            <select className="h-11 w-full rounded-lg border border-line bg-bg px-3" value={titleId} onChange={(event) => setTitleId(event.target.value)}>
              <option value="">Select a finished film</option>
              {(workspace.data?.titles ?? []).map((title) => <option key={title.id} value={title.id}>{title.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Camera unit</span>
            <select className="h-11 w-full rounded-lg border border-line bg-bg px-3" value={cameraUnit} onChange={(event) => setCameraUnit(event.target.value as "A" | "B" | "C")}>
              <option value="A">Camera A — Main</option><option value="B">Camera B</option><option value="C">Camera C</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Camera label</span>
            <input className="h-11 w-full rounded-lg border border-line bg-bg px-3" value={cameraLabel} onChange={(event) => setCameraLabel(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Card label</span>
            <input className="h-11 w-full rounded-lg border border-line bg-bg px-3" placeholder="A001 / CARD-01" value={cardLabel} onChange={(event) => setCardLabel(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Shoot date</span>
            <input type="date" className="h-11 w-full rounded-lg border border-line bg-bg px-3" value={shootDate} onChange={(event) => setShootDate(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Source volume / card</span>
            <input className="h-11 w-full rounded-lg border border-line bg-bg px-3" placeholder="CAM-A-CARD-01" value={sourceVolume} onChange={(event) => setSourceVolume(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Source folder path</span>
            <input className="h-11 w-full rounded-lg border border-line bg-bg px-3" placeholder="Path shown in the DIT manifest" value={sourceRoot} onChange={(event) => setSourceRoot(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Source-card manifest (JSON)</span>
            <input type="file" accept="application/json,.json" className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:font-semibold file:text-fg" onChange={(event) => void handleSourceFile(event.target.files?.[0])} />
            {sourceManifest ? <span className="block text-xs text-muted">{sourceManifest.files.length} manifest entries · {formatBytes(sourceManifest.files.reduce((total, file) => total + file.byteSize, 0))}</span> : null}
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Original camera-card folder</span>
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="block w-full text-sm text-muted"
              onChange={(event) => handleSourceFolder(event.target.files)}
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            />
            <span className="block text-xs text-muted">{sourceMediaFiles.length} original files selected. Files upload directly from this browser to OCI.</span>
          </label>
        </div>
        {fileError ? <p role="alert" className="mt-3 text-sm text-red-600">{fileError}</p> : null}
        {createMutation.error ? <p role="alert" className="mt-3 text-sm text-red-600">{createMutation.error.message}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={createMutation.isPending || !titleId || !cardLabel.trim() || !sourceVolume.trim() || !sourceRoot.trim() || !sourceManifest || !sourceMediaFiles.length} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Uploading and verifying…" : activeSessionId ? "Resume camera-card ingest" : "Register and ingest camera card"}
          </Button>
          <span className="text-xs text-muted">Original files upload to OCI Primary; Bridge creates and verifies the Recovery copy independently.</span>
        </div>
        {uploadProgress ? <p className="mt-3 text-xs text-muted" aria-live="polite">Verified {uploadProgress.completed} of {uploadProgress.total} source files in Primary and Recovery Vaults.</p> : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div><h3 className="font-display text-xl font-semibold">Ingest sessions</h3><p className="mt-1 text-sm text-muted">Verify the Primary Vault and Recovery Vault independently before DIT sign-off.</p></div>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>Refresh</Button>
        </div>
        {workspace.isPending ? <p className="rounded-xl border border-line p-4 text-sm text-muted">Loading DIT sessions…</p> : null}
        {workspace.isError ? <p role="alert" className="rounded-xl border border-line p-4 text-sm text-red-600">Could not load DIT records. Confirm this account has an active Studio DIT role and refresh.</p> : null}
        {!workspace.isPending && !workspace.isError && !sessions.length ? <p className="rounded-xl border border-line p-4 text-sm text-muted">No DIT ingest sessions registered yet.</p> : null}
        {sessions.map((session) => {
          const primary = session.copies.find((copy) => copy.copyType === "PRIMARY");
          const recovery = session.copies.find((copy) => copy.copyType === "RECOVERY");
          const att = attestations[session.id] ?? { folders: false, names: false, card: false };
          const signedOff = session.status === "SIGNED_OFF";
          return (
            <article key={session.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{session.camera_unit} · {session.camera_label} · {session.card_label}</h4>
                  <p className="mt-1 text-xs text-muted">{session.title_id} · {session.shoot_date} · {session.source_file_count} files · {formatBytes(Number(session.source_total_bytes))}</p>
                  <p className="mt-1 break-all text-xs text-muted">Source: {session.source_root}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{session.status.replaceAll("_", " ")}</span>
                  {!signedOff ? <Button size="sm" variant="outline" onClick={() => {
                    setActiveSessionId(session.id);
                    setTitleId(session.title_id);
                    setCameraUnit(session.camera_unit as "A" | "B" | "C");
                    setCameraLabel(session.camera_label);
                    setCardLabel(session.card_label);
                    setShootDate(String(session.shoot_date).slice(0, 10));
                    setSourceVolume(session.source_volume);
                    setSourceRoot(session.source_root);
                  }}>Resume ingest</Button> : null}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(["PRIMARY", "RECOVERY"] as const).map((type) => {
                  const copy = type === "PRIMARY" ? primary : recovery;
                  return (
                    <div key={type} className="rounded-xl border border-line p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{type === "PRIMARY" ? "Primary Vault" : "Recovery Vault"}</p>
                        <span className="text-xs text-muted">{copy ? copy.verified ? "Object read-back verified" : "Verification incomplete" : "Not verified"}</span>
                      </div>
                      {copy ? <p className="mt-2 break-all text-xs text-muted">{copy.fileCount} files · {formatBytes(copy.totalBytes)} · Manifest SHA-256 {copy.manifestSha256.slice(0, 16)}…</p> : null}
                    </div>
                  );
                })}
              </div>
              {!signedOff ? (
                <div className="mt-4 rounded-xl border border-line p-3">
                  <p className="font-semibold">DIT sign-off checks</p>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={att.folders} onChange={(event) => setAttestations((current) => ({ ...current, [session.id]: { ...att, folders: event.target.checked } }))} /> Folder structure preserved</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={att.names} onChange={(event) => setAttestations((current) => ({ ...current, [session.id]: { ...att, names: event.target.checked } }))} /> Original filenames preserved</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={att.card} onChange={(event) => setAttestations((current) => ({ ...current, [session.id]: { ...att, card: event.target.checked } }))} /> Original camera card retained</label>
                  </div>
                  <textarea className="mt-3 min-h-20 w-full rounded-lg border border-line bg-bg p-3 text-sm" placeholder="DIT sign-off note (minimum 8 characters)" value={signoffNotes[session.id] ?? ""} onChange={(event) => setSignoffNotes((current) => ({ ...current, [session.id]: event.target.value }))} />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button size="sm" disabled={!primary?.verified || !recovery?.verified || !att.folders || !att.names || !att.card || (signoffNotes[session.id] ?? "").trim().length < 8 || signoffMutation.isPending}
                      onClick={() => signoffMutation.mutate({ sessionId: session.id, signoffNote: signoffNotes[session.id] ?? "" })}>Sign off ingest</Button>
                    <span className="text-xs text-muted">Both checksum matches and all three operator attestations are required.</span>
                  </div>
                  {signoffMutation.error ? <p role="alert" className="mt-2 text-sm text-red-600">{signoffMutation.error.message}</p> : null}
                </div>
              ) : (
                <p className="mt-4 rounded-lg border border-line px-3 py-2 text-sm">Signed off by the recorded DIT operator. {session.signoff_note}</p>
              )}
            </article>
          );
        })}
      </section>
      <p className="rounded-xl border border-line p-4 text-xs leading-5 text-muted">
        Production boundary: the browser uploads original camera files directly to the OCI Primary Vault. Bridge copies each file to a separately configured OCI Recovery Vault, reads both objects back and verifies SHA-256 against the registered source manifest before it permits DIT sign-off.
      </p>
    </div>
  );
}
