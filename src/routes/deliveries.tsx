import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { hasPermission } from "@/lib/bridge/rbac";
import type { Actor } from "@/lib/bridge/rbac";
import {
  VENDOR_JOB_TYPES,
  type VendorJobType,
} from "@/lib/delivery/vendor-jobs";
import {
  assignVendorDeliveryJob,
  listVendorDeliveryJobs,
  prepareDestinationPackage,
  requestVendorDeliveryJob,
  transitionVendorDeliveryJob,
} from "@/lib/bridge/vendor-delivery-jobs";

export const Route = createFileRoute("/deliveries")({ component: Deliveries });

const LABELS: Record<VendorJobType, string> = {
  dubbing: "Dubbing request",
  loudness_check: "Loudness check",
  imf_request: "IMF package request",
  dcp_request: "DCP package request",
  human_qc: "Human QC",
};

type JobState = "requested" | "assigned" | "in_progress" | "in_review" | "blocked" | "signed_off" | "cancelled";
type VendorJobView = {
  id: string;
  title_id: string;
  title_name: string;
  job_type: VendorJobType;
  state: JobState;
  note: string;
  requested_by: string;
  assigned_vendor: string | null;
  created_at: string;
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
  const canOperate = hasPermission(actor, "title.deliver") && Boolean(actor.internalRole && actor.organizationId);
  const canRead = hasPermission(actor, "delivery.read");
  const [type, setType] = useState<VendorJobType>("human_qc");
  const [titleId, setTitleId] = useState("");
  const [note, setNote] = useState("");
  const [vendorLabel, setVendorLabel] = useState("");
  const [packageTitleId, setPackageTitleId] = useState("");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const titlesQuery = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
    enabled: canRequest || canOperate,
  });
  const jobsQuery = useQuery({
    queryKey: ["bridge-vendor-jobs"],
    queryFn: () => listVendorDeliveryJobs(),
    enabled: canRead,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bridge-vendor-jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["bridge-titles"] }),
    ]);
  };

  const requestMutation = useMutation({
    mutationFn: () => requestVendorDeliveryJob({ data: { titleId, type, note } }),
    onSuccess: async () => {
      setError("");
      setNotice("Vendor request saved in Bridge.");
      setNote("");
      setTitleId("");
      await refresh();
    },
    onError: (cause) => {
      setNotice("");
      setError(cause instanceof Error ? cause.message : "Vendor request failed. No request was confirmed.");
    },
  });
  const assignMutation = useMutation({
    mutationFn: (jobId: string) => assignVendorDeliveryJob({ data: { jobId, vendorLabel } }),
    onSuccess: async () => {
      setError("");
      setNotice("Vendor assignment saved.");
      setVendorLabel("");
      await refresh();
    },
    onError: () => {
      setNotice("");
      setError("Vendor assignment failed. Check organization scope and job state.");
    },
  });
  const transitionMutation = useMutation({
    mutationFn: (input: { jobId: string; action: "start_work" | "submit_review" | "sign_off" | "block" }) =>
      transitionVendorDeliveryJob({ data: input }),
    onSuccess: async (result) => {
      setError("");
      setNotice(result.state === "signed_off" ? "Human sign-off recorded. This does not authorize external delivery." : "Vendor job status updated.");
      await refresh();
    },
    onError: (cause) => {
      setNotice("");
      setError(cause instanceof Error ? cause.message : "The job could not be updated.");
    },
  });
  const packageMutation = useMutation({
    mutationFn: () => prepareDestinationPackage({ data: { titleId: packageTitleId, destination } }),
    onSuccess: async () => {
      setError("");
      setNotice("Destination package record created in HOLD. No dispatch or publication occurred.");
      setPackageTitleId("");
      setDestination("");
      await refresh();
    },
    onError: (cause) => {
      setNotice("");
      setError(cause instanceof Error ? cause.message : "Package preparation was blocked.");
    },
  });

  const titles = titlesQuery.data?.titles ?? [];
  const jobs = (jobsQuery.data?.jobs ?? []) as VendorJobView[];
  const busy = requestMutation.isPending || assignMutation.isPending || transitionMutation.isPending || packageMutation.isPending;

  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Vendor jobs</h2>
      <p className="mt-1 text-sm text-muted">
        Requests are persisted in Bridge. Vendor assignment and workflow actions are organization-scoped.
        Sign-off is a human review record, not proof of file delivery or permission to publish.
      </p>

      {canRequest ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.5fr_2fr_auto]">
          <label className="grid gap-1 text-xs text-muted">
            Work type
            <select
              aria-label="Vendor job type"
              className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-fg"
              value={type}
              onChange={(event) => setType(event.target.value as VendorJobType)}
            >
              {VENDOR_JOB_TYPES.map((jobType) => (
                <option key={jobType} value={jobType}>{LABELS[jobType]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">
            Title
            <select
              aria-label="Title for vendor job"
              className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-fg"
              value={titleId}
              onChange={(event) => setTitleId(event.target.value)}
              disabled={titlesQuery.isPending || titles.length === 0}
            >
              <option value="">{titlesQuery.isPending ? "Loading titles…" : "Select a title"}</option>
              {titles.map((title) => <option key={title.id} value={title.id}>{title.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">
            Note (optional)
            <input
              className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-fg"
              value={note}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Scope or technical notes"
            />
          </label>
          <button
            type="button"
            className="self-end rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
            disabled={!titleId || busy || titlesQuery.isPending}
            onClick={() => requestMutation.mutate()}
          >
            Request
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">You can view jobs. Request needs title ownership or delivery write permission.</p>
      )}

      {canOperate ? (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Prepare destination package</h3>
          <p className="mt-1 text-xs text-muted">Requires LICENSED title, QC PASS, legal approval, active rights and verified master/poster. New package remains HOLD.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select
              aria-label="Title for destination package"
              className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-fg"
              value={packageTitleId}
              onChange={(event) => setPackageTitleId(event.target.value)}
              disabled={titlesQuery.isPending || titles.length === 0}
            >
              <option value="">Select licensed title</option>
              {titles.map((title) => <option key={title.id} value={title.id}>{title.name} · {title.status}</option>)}
            </select>
            <input
              aria-label="Destination"
              className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-fg"
              value={destination}
              maxLength={160}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Destination / buyer label"
            />
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              disabled={!packageTitleId || destination.trim().length < 2 || busy}
              onClick={() => packageMutation.mutate()}
            >
              Prepare — HOLD
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-muted" role="status">{notice}</p> : null}

      <div className="mt-4">
        <h3 className="text-sm font-semibold">Vendor job history</h3>
        {jobsQuery.isPending && canRead ? <p className="p-4 text-sm text-muted">Loading vendor jobs…</p> : null}
        {jobsQuery.isError ? <p className="p-4 text-sm text-red-600" role="alert">Vendor job history is unavailable. No write was attempted.</p> : null}
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
          {jobs.map((job) => (
            <li key={job.id} className="grid gap-3 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{LABELS[job.job_type]} · {job.title_name}</span>
                <span className="rounded-full border border-line px-2 py-1 text-xs">{job.state.replaceAll("_", " ")}</span>
              </div>
              <p className="text-xs text-muted">
                {job.assigned_vendor ? `Vendor: ${job.assigned_vendor} · ` : ""}Requested by {job.requested_by}
              </p>
              {canOperate && job.state === "requested" ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    aria-label={`Vendor label for ${job.title_name}`}
                    className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
                    value={vendorLabel}
                    onChange={(event) => setVendorLabel(event.target.value)}
                    placeholder="Vendor label"
                  />
                  <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs disabled:opacity-50" disabled={vendorLabel.trim().length < 2 || busy} onClick={() => assignMutation.mutate(job.id)}>Assign vendor</button>
                  <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs disabled:opacity-50" disabled={busy} onClick={() => transitionMutation.mutate({ jobId: job.id, action: "block" })}>Block</button>
                </div>
              ) : null}
              {canOperate && job.state === "assigned" ? (
                <button type="button" className="w-fit rounded-lg border border-line px-3 py-2 text-xs" disabled={busy} onClick={() => transitionMutation.mutate({ jobId: job.id, action: "start_work" })}>Start work</button>
              ) : null}
              {canOperate && job.state === "in_progress" ? (
                <button type="button" className="w-fit rounded-lg border border-line px-3 py-2 text-xs" disabled={busy} onClick={() => transitionMutation.mutate({ jobId: job.id, action: "submit_review" })}>Submit for review</button>
              ) : null}
              {canOperate && job.state === "in_review" ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs" disabled={busy} onClick={() => transitionMutation.mutate({ jobId: job.id, action: "sign_off" })}>Human sign-off</button>
                  <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs" disabled={busy} onClick={() => transitionMutation.mutate({ jobId: job.id, action: "block" })}>Block</button>
                </div>
              ) : null}
            </li>
          ))}
          {!jobs.length && !jobsQuery.isPending && !jobsQuery.isError ? (
            <li className="p-4 text-sm text-muted">{canRead ? "No persisted vendor jobs in your organization." : "Vendor job access is not granted to this account."}</li>
          ) : null}
        </ul>
      </div>
    </section>
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
        {titles.map((title) => (
          <Link
            key={title.id}
            to="/title/$id"
            params={{ id: title.id }}
            className="flex items-center justify-between gap-3 p-4 hover:bg-fg/5"
          >
            <div>
              <p className="text-sm font-semibold">{title.name}</p>
              <p className="text-xs text-muted">{title.language}{title.year ? ` · ${title.year}` : ""}</p>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold">
              {title.status === "DELIVERED" ? "DELIVERED" : "OPEN TITLE"}
            </span>
          </Link>
        ))}
      </div>
      {!titles.length ? <p className="mt-5 text-sm text-muted">No titles available in your permitted scope.</p> : null}
    </section>
  );
}
