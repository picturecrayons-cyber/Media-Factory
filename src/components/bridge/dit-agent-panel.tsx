import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createDitIntakeJob, getDitWorkspace, setDitAgentEnabled } from "@/lib/bridge/dit-agent";

export function DitAgentPanel() {
  const qc = useQueryClient();
  const [titleId, setTitleId] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceType, setSourceType] = useState<"CAMERA_CARD" | "EXTERNAL_DRIVE" | "FOLDER">("CAMERA_CARD");
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

  if (workspace.isLoading) return <section className="rounded-2xl border border-line p-5 text-sm text-muted">Loading DIT Agent…</section>;
  if (workspace.isError) return <section className="rounded-2xl border border-line p-5 text-sm text-muted">DIT Agent service unavailable. Check Production database migration and server configuration before enabling.</section>;
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
