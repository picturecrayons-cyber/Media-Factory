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
  listVendorDeliveryJobs,
  requestVendorDeliveryJob,
  transitionVendorDeliveryJob,
} from "@/lib/bridge/vendor-delivery-jobs";

export const Route = createFileRoute("/deliveries")({ component: Deliveries });

const LABELS: Record<VendorJobType, string> = {
  dubbing: "Dubbing request",
  loudness_check: "Loudness check (not a Dolby encode)",
  imf_request: "IMF package request",
  dcp_request: "DCP package request",
  human_qc: "Human QC",
};

type JobState = "requested" | "in_review" | "blocked" | "signed_off";
type VendorJobView = {
  id: string;
  title_id: string;
  title_name: string;
  job_type: VendorJobType;
  state: JobState;
  note: string;
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
  const canReview = hasPermission(actor, "title.deliver");
  const [type, setType] = useState<VendorJobType>("human_qc");
  const [titleId, setTitleId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const titlesQuery = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
  });
  const jobsQuery = useQuery({
    queryKey: ["bridge-vendor-jobs"],
    queryFn: () => listVendorDeliveryJobs(),
  });
  const refreshJobs = () => queryClient.invalidateQueries({ queryKey: ["bridge-vendor-jobs"] });
  const requestMutation = useMutation({
    mutationFn: () => requestVendorDeliveryJob({ data: { titleId, type, note } }),
    onSuccess: async () => {
      setError("");
      setNote("");
      await refreshJobs();
    },
    onError: () => setError("Could not create the request. Check title access and try again."),
  });
  const transitionMutation = useMutation({
    mutationFn: (input: { jobId: string; action: "start_review" | "sign_off" | "block" }) =>
      transitionVendorDeliveryJob({ data: input }),
    onSuccess: async () => {
      setError("");
      await refreshJobs();
    },
    onError: () => setError("The job could not be updated. It may have changed or your role may not allow this action."),
  });
  const titles = titlesQuery.data?.titles ?? [];
  const jobs = (jobsQuery.data?.jobs ?? []) as VendorJobView[];

  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Vendor jobs</h2>
      <p className="mt-1 text-sm text-muted">
        Requests are saved to Bridge. Dubbing, loudness, IMF, DCP and human QC remain requests until a permitted reviewer signs off; payment alone never authorizes delivery.
      </p>
      {canRequest ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span>Title</span>
            <select
              className="rounded-lg border border-line bg-transparent px-3 py-2"
              value={titleId}
              onChange={(e) => setTitleId(e.target.value)}
              disabled={titlesQuery.isPending || !titles.length}
            >
              <option value="">Select an accessible title</option>
              {titles.map((title) => (
                <option key={title.id} value={title.id}>{title.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Job type</span>
            <select
              className="rounded-lg border border-line bg-transparent px-3 py-2"
              value={type}
              onChange={(e) => setType(e.target.value as VendorJobType)}
            >
              {VENDOR_JOB_TYPES.map((jobType) => (
                <option key={jobType} value={jobType}>{LABELS[jobType]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span>Notes (optional)</span>
            <textarea
              className="min-h-20 rounded-lg border border-line bg-transparent px-3 py-2"
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Scope, delivery requirements or reviewer context"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={!titleId || requestMutation.isPending}
              onClick={() => requestMutation.mutate()}
            >
              {requestMutation.isPending ? "Saving request…" : "Create vendor request"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Your role can view eligible jobs but cannot create vendor requests.</p>
      )}
      {titlesQuery.isError ? <p className="mt-3 text-sm" role="alert">Accessible titles could not be loaded.</p> : null}
      {error ? <p className="mt-3 text-sm" role="alert">{error}</p> : null}
      {jobsQuery.isError ? (
        <p className="mt-4 text-sm" role="alert">Saved vendor jobs could not be loaded. Refresh to retry.</p>
      ) : jobsQuery.isPending ? (
        <p className="mt-4 text-sm text-muted">Loading saved vendor jobs…</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {jobs.map((job) => (
            <li key={job.id} className="grid gap-3 p-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="font-semibold">{LABELS[job.job_type] ?? job.job_type} · {job.title_name}</p>
                <p className="mt-1 text-xs text-muted">
                  {job.state.replace("_", " ")} · {job.note || "No additional notes"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canReview && job.state === "requested" ? (
                  <button className="rounded-lg border border-line px-3 py-2 text-xs" disabled={transitionMutation.isPending}
                    onClick={() => transitionMutation.mutate({ jobId: job.id, action: "start_review" })}>
                    Start review
                  </button>
                ) : null}
                {canReview && job.state === "in_review" ? (
                  <button className="rounded-lg border border-line px-3 py-2 text-xs" disabled={transitionMutation.isPending}
                    onClick={() => transitionMutation.mutate({ jobId: job.id, action: "sign_off" })}>
                    Sign off
                  </button>
                ) : null}
                {canReview && (job.state === "requested" || job.state === "in_review") ? (
                  <button className="rounded-lg border border-line px-3 py-2 text-xs" disabled={transitionMutation.isPending}
                    onClick={() => transitionMutation.mutate({ jobId: job.id, action: "block" })}>
                    Block
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {!jobs.length ? <li className="p-4 text-sm text-muted">No saved vendor jobs yet.</li> : null}
        </ul>
      )}
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
