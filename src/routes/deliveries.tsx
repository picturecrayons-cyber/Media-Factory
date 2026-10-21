import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { hasPermission } from "@/lib/bridge/rbac";
import type { Actor } from "@/lib/bridge/rbac";
import {
  VENDOR_JOB_TYPES,
  canDeliver,
  createVendorJob,
  type VendorJob,
  type VendorJobType,
} from "@/lib/delivery/vendor-jobs";

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
  const canRequest = hasPermission(actor, "title.deliver") || hasPermission(actor, "title.create");
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), enabled: canRequest });
  const titles = titlesQ.data?.titles ?? [];
  const [jobs, setJobs] = useState<VendorJob[]>([]);
  const [type, setType] = useState<VendorJobType>("human_qc");
  const [titleId, setTitleId] = useState("");
  const [error, setError] = useState("");

  function onRequest() {
    const selectedTitle = titles.find((title) => title.id === titleId);
    if (!selectedTitle) {
      setError(titlesQ.isError
        ? "Titles could not be loaded. Refresh and try again."
        : "Select a title before requesting a vendor job.");
      return;
    }
    try {
      const job = createVendorJob(type, selectedTitle.id);
      setJobs((prev) => [job, ...prev]);
      setError("");
      setTitleId("");
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "unknown_job_type"
        ? "Choose a supported vendor job type."
        : "The vendor job could not be requested. Please try again.");
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Vendor jobs</h2>
      <p className="mt-1 text-sm text-muted">
        Dubbing, loudness, IMF, DCP, and human QC open as requested. No auto Dolby, IMF, or DCP master. Delivery only after sign-off.
      </p>
      {canRequest ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            aria-label="Vendor job type"
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as VendorJobType)}
          >
            {VENDOR_JOB_TYPES.map((jobType) => (
              <option key={jobType} value={jobType}>
                {LABELS[jobType]}
              </option>
            ))}
          </select>
          <select
            aria-label="Title"
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
            value={titleId}
            onChange={(e) => {
              setTitleId(e.target.value);
              setError("");
            }}
            disabled={titlesQ.isPending || titlesQ.isError || titles.length === 0}
          >
            <option value="">
              {titlesQ.isPending ? "Loading titles…" : titlesQ.isError ? "Titles unavailable" : titles.length === 0 ? "No titles available" : "Select a title"}
            </option>
            {titles.map((title) => (
              <option key={title.id} value={title.id}>
                {title.name}{title.year ? ` · ${title.year}` : ""} — {title.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
            onClick={onRequest}
            disabled={!titleId || titlesQ.isPending || titlesQ.isError || !titles.some((title) => title.id === titleId)}
          >
            Request
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">You can view jobs. Request needs delivery write.</p>
      )}
      {error ? <p className="mt-3 text-sm" role="alert">{error}</p> : null}
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
        {jobs.map((job) => (
          <li key={job.id} className="flex items-center justify-between gap-3 p-4 text-sm">
            <span>{LABELS[job.type]} · {job.titleId}</span>
            <span>{job.state}{canDeliver(job) ? " · download allowed" : " · no output"}</span>
          </li>
        ))}
        {!jobs.length ? <li className="p-4 text-sm text-muted">No vendor jobs yet.</li> : null}
      </ul>
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
