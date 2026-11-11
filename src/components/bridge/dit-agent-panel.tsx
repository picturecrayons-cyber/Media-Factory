import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createDitIntakeJob, finalizeDitFileUpload, getDitJobFiles, getDitWorkspace, registerDitFile, setDitAgentEnabled, signOffDitJob, markDitFileFailed } from "@/lib/bridge/dit-agent";

export function DitAgentPanel() {
  const qc = useQueryClient();
  const [titleId, setTitleId] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceType, setSourceType] = useState<"CAMERA_CARD" | "EXTERNAL_DRIVE" | "FOLDER">("CAMERA_CARD");
  const [uploadState, setUploadState] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [signoffStatement, setSignoffStatement] = useState("");
  const [signoffChecks, setSignoffChecks] = useState({ sourceReconciled: false, noMissingClips: false, noDuplicateClips: false, checksumsVerified: false, allThreeCopiesVerified: false, sourceCardSafeToReuse: false });
  const folderInput = useRef<HTMLInputElement>(null);
  useEffect(() => { folderInput.current?.setAttribute("webkitdirectory", ""); folderInput.current?.setAttribute("directory", ""); }, []);
  const workspace = useQuery({ queryKey: ["studio-dit-workspace"], queryFn: () => getDitWorkspace(), retry: false });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setDitAgentEnabled({ data: { enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio-dit-workspace"] }),
  });
  const create = useMutation({
    mutationFn: () => createDitIntakeJob({ data: { titleId: titleId.trim(), sourceLabel: sourceLabel.trim(), sourceType } }),
    onSuccess: () => {
      setSourceLabel("");
      void qc.invalidateQueries({ queryKey: ["studio-dit-workspace"] });
    },
  });

  const activeJobId = create.data?.jobId;
  const signoff = useMutation({ mutationFn: () => signOffDitJob({ data: { jobId: activeJobId!, statement: signoffStatement, checklist: { sourceReconciled: true, noMissingClips: true, noDuplicateClips: true, checksumsVerified: true, allThreeCopiesVerified: true, sourceCardSafeToReuse: true } } }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["studio-dit-workspace"] }); } });
  const jobFiles = useQuery({
    queryKey: ["studio-dit-files", activeJobId],
    queryFn: () => getDitJobFiles({ data: { jobId: activeJobId! } }),
    enabled: Boolean(activeJobId),
    refetchInterval: activeJobId ? 5000 : false,
  });
  async function uploadSelected(files: FileList | null) {
    if (!files || !activeJobId) return;
    const selected = Array.from(files);
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      setUploadState("Registering " + (index + 1) + "/" + selected.length + ": " + relativePath);
      setUploadProgress(0);
      let registeredFileId: string | undefined;
      try {
        const registered = await registerDitFile({ data: { jobId: activeJobId, relativePath, fileName: file.name, byteSize: file.size, contentType: file.type || "application/octet-stream" } });
        registeredFileId = registered.fileId;
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", registered.upload.url);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
          xhr.upload.onprogress = (event) => { if (event.lengthComputable) setUploadProgress(Math.round(event.loaded / event.total * 100)); };
          xhr.onerror = () => reject(new Error("OCI upload network error"));
          xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("OCI upload failed (" + xhr.status + ")"));
          xhr.send(file);
        });
        setUploadState("Verifying source and creating three copies: " + relativePath);
        const finalized = await finalizeDitFileUpload({ data: { jobId: activeJobId, fileId: registered.fileId } });
        if ("duplicate" in finalized && finalized.duplicate) {
          setUploadState("WARNING · Duplicate content detected: " + relativePath);
          void qc.invalidateQueries({ queryKey: ["studio-dit-files", activeJobId] });
          break;
        }
        setUploadState("PASS · " + relativePath);
        void qc.invalidateQueries({ queryKey: ["studio-dit-files", activeJobId] });
      } catch (error) {
        if (registeredFileId) { try { await markDitFileFailed({ data: { jobId: activeJobId, fileId: registeredFileId, reason: String(error).slice(0, 900) } }); } catch { /* preserve original upload failure */ } }
        setUploadState("FAIL · " + relativePath + " · " + String(error));
        void qc.invalidateQueries({ queryKey: ["studio-dit-files", activeJobId] });
        break;
      }
    }
    void qc.invalidateQueries({ queryKey: ["studio-dit-workspace"] });
  }

  if (workspace.isLoading) return <section className="rounded-2xl border border-line p-5 text-sm text-muted">Loading DIT Agent…</section>;
  if (workspace.isError) return <section className="rounded-2xl border border-line p-5 text-sm text-muted">DIT Agent service unavailable. Check Production database migration and server configuration before enabling.</section>;
  if (!workspace.data) return <section className="rounded-2xl border border-line p-5 text-sm text-muted">DIT Agent workspace returned no data. Refresh and retry.</section>;
  const enabled = workspace.data.enabled;
  return (
    <section className="space-y-5 rounded-2xl border border-line bg-surface p-5" aria-labelledby="dit-agent-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="dit-agent-heading" className="font-display text-xl font-semibold">DIT Agent</h2>
          <p className="mt-1 text-sm text-muted">Camera-card intake and three-copy verification control plane.</p>
        </div>
        <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate(!enabled)}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium disabled:opacity-50">
          {toggle.isPending ? "Saving…" : enabled ? "Disable DIT Agent" : "Enable DIT Agent"}
        </button>
      </div>
      <p className="text-xs text-muted">Agent: {enabled ? "ENABLED" : "DISABLED"} · New jobs start as NOT VERIFIED. Card-safe status is never assumed.</p>
      {enabled ? (
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm md:col-span-1">Bridge Title ID
            <input value={titleId} onChange={(e) => setTitleId(e.target.value)} placeholder="Paste existing Title ID"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">Camera card / drive label
            <input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="e.g. A-CAM CARD 01"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">Source type
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2">
              <option value="CAMERA_CARD">Camera card</option>
              <option value="EXTERNAL_DRIVE">External drive</option>
              <option value="FOLDER">Folder</option>
            </select>
          </label>
          <div className="md:col-span-3">
            <button type="button" disabled={create.isPending || !titleId.trim() || !sourceLabel.trim()}
              onClick={() => create.mutate()} className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg disabled:opacity-40">
              {create.isPending ? "Creating…" : "Create intake job"}
            </button>
          </div>
        </div>
      ) : <p className="text-sm text-muted">Enable the agent to create a new intake job.</p>}
      {activeJobId ? (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-semibold">Camera card / folder ingest</h3><p className="text-xs text-muted">Job {activeJobId} · original relative paths retained</p></div>
            <button type="button" onClick={() => folderInput.current?.click()} className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg">Choose card folder</button>
            <input ref={folderInput} type="file" multiple className="hidden" onChange={(e) => { void uploadSelected(e.currentTarget.files); e.currentTarget.value = ""; }} />
          </div>
          {uploadState ? <div className="space-y-1 text-xs"><p role="status">{uploadState}</p><div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-fg transition-all" style={{ width: uploadProgress + "%" }} /></div><p className="text-muted">{uploadProgress}% transfer progress</p></div> : null}
          {jobFiles.data?.files?.length ? <div className="space-y-1">{jobFiles.data.files.map((file: {id:string;relative_path:string;status:string;detected_format:string|null;byte_size:number}) => <div key={file.id} className="flex flex-wrap justify-between gap-2 border-t border-line py-2 text-xs"><span>{file.relative_path} · {file.detected_format || "UNKNOWN"} · {Math.round(file.byte_size / 1024 / 1024)} MB</span><strong>{file.status}</strong></div>)}</div> : null}
          <div className="space-y-2 border-t border-line pt-3">
            <h4 className="text-sm font-semibold">DIT sign-off</h4>
            {([
              ["sourceReconciled", "Source card inventory reconciled"],
              ["noMissingClips", "No missing clips confirmed"],
              ["noDuplicateClips", "No duplicate clips confirmed"],
              ["checksumsVerified", "Source and destination checksums verified"],
              ["allThreeCopiesVerified", "MASTER, BACKUP_1 and BACKUP_2 verified"],
              ["sourceCardSafeToReuse", "Source card safe to reuse"],
            ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={signoffChecks[key]} onChange={(e) => setSignoffChecks((current) => ({ ...current, [key]: e.target.checked }))} />{label}</label>)}
            <textarea value={signoffStatement} onChange={(e) => setSignoffStatement(e.target.value)} placeholder="DIT operator sign-off statement (minimum 20 characters)" className="min-h-20 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" />
            <button type="button" disabled={signoff.isPending || !jobFiles.data?.files?.length || jobFiles.data.files.some((file: {status:string}) => file.status !== "VERIFIED") || Object.values(signoffChecks).some((value) => !value) || signoffStatement.trim().length < 20} onClick={() => signoff.mutate()} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">{signoff.isPending ? "Signing off…" : "Submit DIT sign-off"}</button>
            {signoff.isError ? <p role="alert" className="text-xs text-accent">{String(signoff.error)}</p> : null}
            {signoff.isSuccess ? <p className="text-xs font-semibold">Sign-off saved · Card Safe PASS</p> : null}
          </div>
          <p className="text-xs text-muted">Codec probing, resumable multipart, pause/resume, proxy generation and editor handoff are not yet connected. Format labels are extension-based, not codec certification.</p>
        </div>
      ) : null}
      {toggle.isError || create.isError ? <p role="alert" className="text-sm text-accent">{String(toggle.error ?? create.error)}</p> : null}
      {create.isSuccess ? <p className="text-sm text-muted">Job {create.data.jobId} created. Ingest remains NOT CONNECTED until the card-ingest worker is installed.</p> : null}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Recent intake jobs</h3>
        {workspace.data.jobs.length ? workspace.data.jobs.map((job) => (
          <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
            <div><p className="font-medium">{job.source_label}</p><p className="text-xs text-muted">{job.title_id} · {job.source_type}</p></div>
            <span className="text-xs text-muted">{job.status} · Card safe: {job.card_safe ? "PASS" : "NOT VERIFIED"}</span>
          </div>
        )) : <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No DIT intake jobs yet.</p>}
      </div>
      <p className="text-xs text-muted">ARRIRAW / RED RAW / ProRes codec probing, multipart ingest, independent MASTER / BACKUP_1 / BACKUP_2 SHA-256 verification, proxy jobs and sign-off are not yet connected. Storage Verified remains unavailable until every copy is independently verified.</p>
    </section>
  );
}
