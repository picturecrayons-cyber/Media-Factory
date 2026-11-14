import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { hasPermission } from "@/lib/bridge/rbac";
import type { Actor } from "@/lib/bridge/rbac";
import { VENDOR_JOB_TYPES, type VendorJobType } from "@/lib/delivery/vendor-jobs";
import {
  approveBridgeDeliveryJob,
  assignBridgeDeliveryJob,
  completeBridgeDeliveryJob,
  listBridgeDeliveryJobs,
  requestBridgeDeliveryJob,
} from "@/lib/bridge/delivery-jobs";

export const Route = createFileRoute("/deliveries")({ component: Deliveries });

const LABELS: Record<VendorJobType, string> = {
  dubbing: "Dubbing request",
  loudness_check: "Loudness check (not a Dolby encode)",
  imf_request: "IMF package request",
  dcp_request: "DCP package request",
  human_qc: "Human QC",
};

function Deliveries() {
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Deliveries">
          <VendorJobs actor={actor} />
          <DeliveryList />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function VendorJobs({ actor }: { actor: Actor }) {
  const queryClient = useQueryClient();
  const canRequest = hasPermission(actor, "title.deliver") || hasPermission(actor, "title.create");
  const canManage = hasPermission(actor, "title.deliver");
  const canApprove = hasPermission(actor, "loop.publish");
  const [type, setType] = useState<VendorJobType>("human_qc");
  const [titleId, setTitleId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const jobsQuery = useQuery({
    queryKey: ["bridge-delivery-jobs"],
    queryFn: () => listBridgeDeliveryJobs(),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bridge-delivery-jobs"] });
  const request = useMutation({
    mutationFn: (data: { titleId: string; type: VendorJobType; note?: string }) =>
      requestBridgeDeliveryJob({ data }),
    onSuccess: async () => { setTitleId(""); setNote(""); setError(""); await refresh(); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Delivery request failed"),
  });
  const jobs = jobsQuery.data?.jobs ?? [];

  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Vendor jobs</h2>
      <p className="mt-1 text-sm text-muted">
        Requests are persisted in Bridge. Payment does not approve a deliverable; vendor receipt and Super Admin sign-off are separate controls.
      </p>
      {canRequest ? (
        <div className="mt-4 grid gap-2 md:grid-cols-[180px_minmax(180px,1fr)_minmax(200px,1.5fr)_auto]">
          <label className="space-y-1 text-xs text-muted">
            <span>Work type</span>
            <select
              id="vendor-job-type"
              name="workType"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-fg"
              value={type}
              onChange={(e) => setType(e.target.value as VendorJobType)}
            >
              {VENDOR_JOB_TYPES.map((jobType) => (
                <option key={jobType} value={jobType}>{LABELS[jobType]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>Title ID</span>
            <input
              id="vendor-job-title-id"
              name="titleId"
              aria-label="Title ID"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-fg"
              placeholder="Title id"
              value={titleId}
              onChange={(e) => setTitleId(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>Instructions</span>
            <input
              name="deliveryNote"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-fg"
              placeholder="Optional delivery instructions"
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button type="button" className="self-end rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
            disabled={request.isPending || !titleId.trim()} onClick={() => request.mutate({ titleId: titleId.trim(), type, note: note.trim() })}>
            {request.isPending ? "Saving…" : "Request"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">You can view delivery jobs. New requests require an authorized Creator, Studio or delivery operator account.</p>
      )}
      {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}
      {jobsQuery.isError ? <p className="mt-3 text-sm text-red-600" role="alert">Delivery records could not be loaded.</p> : null}
      {jobsQuery.isPending ? <p className="mt-4 text-sm text-muted">Loading persisted delivery jobs…</p> : (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {jobs.map((job: {
            id: string; type: string; state: string; titleId: string; note: string;
            assignedVendor: string | null; receiptUrl: string | null; signedOff: boolean;
            createdAt: string;
          }) => (
            <li key={job.id} className="space-y-3 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{LABELS[job.type as VendorJobType] ?? job.type} · {job.titleId}</p>
                  <p className="mt-1 text-xs text-muted">{job.note || "No additional instructions"} · {new Date(job.createdAt).toLocaleString()}</p>
                  {job.assignedVendor ? <p className="mt-1 text-xs text-muted">Vendor: {job.assignedVendor}</p> : null}
                </div>
                <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">
                  {job.state.replaceAll("_", " ").toUpperCase()}{job.signedOff ? " · SIGNED OFF" : ""}
                </span>
              </div>
              {job.receiptUrl ? <a href={job.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-accent underline">Open delivery receipt</a> : null}
              {(canManage && job.state === "requested") || (canManage && job.state === "in_progress") || (canApprove && job.state === "completed") ? (
                <DeliveryJobActions job={job} canManage={canManage} canApprove={canApprove} onUpdated={refresh} />
              ) : null}
            </li>
          ))}
          {!jobs.length ? <li className="p-4 text-sm text-muted">No persisted vendor jobs yet.</li> : null}
        </ul>
      )}
    </section>
  );
}

function DeliveryJobActions({
  job, canManage, canApprove, onUpdated,
}: {
  job: { id: string; state: string };
  canManage: boolean;
  canApprove: boolean;
  onUpdated: () => Promise<unknown>;
}) {
  const [vendor, setVendor] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [note, setNote] = useState("Delivery receipt and technical evidence reviewed");
  const [error, setError] = useState("");
  const assign = useMutation({
    mutationFn: () => assignBridgeDeliveryJob({ data: { jobId: job.id, vendor } }),
    onSuccess: async () => { setError(""); await onUpdated(); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Assignment failed"),
  });
  const complete = useMutation({
    mutationFn: () => completeBridgeDeliveryJob({ data: { jobId: job.id, receiptUrl } }),
    onSuccess: async () => { setError(""); await onUpdated(); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Completion failed"),
  });
  const approve = useMutation({
    mutationFn: () => approveBridgeDeliveryJob({ data: { jobId: job.id, note } }),
    onSuccess: async () => { setError(""); await onUpdated(); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Approval failed"),
  });
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-fg/5 p-3">
      {canManage && job.state === "requested" ? <>
        <label className="min-w-[180px] flex-1 space-y-1 text-xs text-muted">
          <span>Assign vendor</span>
          <input className="w-full rounded border border-line bg-transparent px-2 py-1.5 text-sm text-fg" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor / service provider" />
        </label>
        <button type="button" disabled={assign.isPending || vendor.trim().length < 2} onClick={() => assign.mutate()} className="rounded border border-line px-3 py-2 text-xs disabled:opacity-50">Assign</button>
      </> : null}
      {canManage && job.state === "in_progress" ? <>
        <label className="min-w-[220px] flex-1 space-y-1 text-xs text-muted">
          <span>HTTPS delivery receipt URL</span>
          <input className="w-full rounded border border-line bg-transparent px-2 py-1.5 text-sm text-fg" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://…" />
        </label>
        <button type="button" disabled={complete.isPending || !receiptUrl.startsWith("https://")} onClick={() => complete.mutate()} className="rounded border border-line px-3 py-2 text-xs disabled:opacity-50">Mark completed</button>
      </> : null}
      {canApprove && job.state === "completed" ? <>
        <label className="min-w-[220px] flex-1 space-y-1 text-xs text-muted">
          <span>Sign-off note</span>
          <input className="w-full rounded border border-line bg-transparent px-2 py-1.5 text-sm text-fg" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </label>
        <button type="button" disabled={approve.isPending || note.trim().length < 8} onClick={() => approve.mutate()} className="rounded border border-line px-3 py-2 text-xs disabled:opacity-50">Super Admin sign-off</button>
      </> : null}
      {error ? <p role="alert" className="w-full text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function DeliveryList() {
  const q = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = q.data?.titles ?? [];
  if (q.isError) return <p role="alert">Delivery data is unavailable. Refresh to retry.</p>;
  if (q.isPending) return <p className="text-sm text-muted">Loading deliveries…</p>;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Delivery desk</h2>
      <p className="mt-1 text-sm text-muted">
        Open a title to review its canonical Delivery workspace. No rights or fulfilment rules are changed here.
      </p>
      <div className="mt-5 divide-y divide-line rounded-xl border border-line">
        {titles.map((t) => (
          <Link
            key={t.id}
            to="/title/$id"
            params={{ id: t.id }}
            className="flex items-center justify-between gap-3 p-4 hover:bg-fg/5"
          >
            <div>
              <p className="text-sm font-semibold">{t.name}</p>
              <p className="text-xs text-muted">
                {t.language}
                {t.year ? ` · ${t.year}` : ""}
              </p>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold">
              {t.status === "DELIVERED" ? "DELIVERED" : "OPEN TITLE"}
            </span>
          </Link>
        ))}
      </div>
      {!titles.length ? <p className="mt-5 text-sm text-muted">No titles available.</p> : null}
    </section>
  );
}
