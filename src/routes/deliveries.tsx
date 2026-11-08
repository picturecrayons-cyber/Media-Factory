import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { listTitleAssets } from "@/lib/bridge/assets";
import { AssetPosterSlot } from "@/components/bridge/asset-preview-gallery";
import type { BridgeTitle } from "@/lib/bridge/types";
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
  const [jobs, setJobs] = useState<VendorJob[]>([]);
  const [type, setType] = useState<VendorJobType>("human_qc");
  const [titleId, setTitleId] = useState("");
  const [error, setError] = useState("");

  function onRequest() {
    try {
      setJobs((prev) => [createVendorJob(type, titleId), ...prev]);
      setError("");
      setTitleId("");
    } catch {
      setError("Title id required. Job stays requested until a reviewer signs off.");
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
          <label htmlFor="vendor-job-type" className="sr-only">Work type</label>
          <select
            id="vendor-job-type"
            name="workType"
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
          <label htmlFor="vendor-job-title-id" className="sr-only">Title ID</label>
          <input
            id="vendor-job-title-id"
            name="titleId"
            aria-label="Title ID"
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
            placeholder="Title id"
            value={titleId}
            onChange={(e) => setTitleId(e.target.value)}
          />
          <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm" onClick={onRequest}>
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
  const [search, setSearch] = useState("");
  const titles = q.data?.titles ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleTitles = titles.filter((title) =>
    [title.name, title.language, title.year == null ? "" : String(title.year), title.id]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );

  if (q.isError) return <p role="alert">Delivery data is unavailable. Refresh to retry.</p>;
  if (q.isPending) return <p className="text-sm text-muted">Loading deliveries…</p>;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Delivery desk</h2>
          <p className="mt-1 text-sm text-muted">
            Canonical title catalogue · Verified poster previews · Open a title to review its Delivery workspace.
          </p>
        </div>
        <span className="text-xs text-muted" aria-live="polite">
          {visibleTitles.length} of {titles.length} titles
        </span>
      </div>
      <label htmlFor="delivery-title-search" className="sr-only">Search titles</label>
      <input
        id="delivery-title-search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search title, language, year or title ID"
        className="mt-4 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleTitles.map((title) => (
          <DeliveryTitleCard key={title.id} title={title} />
        ))}
      </div>
      {!titles.length ? (
        <p className="mt-5 text-sm text-muted">No titles available in the canonical catalogue.</p>
      ) : null}
      {titles.length > 0 && !visibleTitles.length ? (
        <p className="mt-5 text-sm text-muted">No titles match this search.</p>
      ) : null}
    </section>
  );
}

function DeliveryTitleCard({ title }: { title: BridgeTitle }) {
  const assetsQ = useQuery({
    queryKey: ["bridge-assets", title.id],
    queryFn: () => listTitleAssets({ data: { titleId: title.id } }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return (
    <Link
      to="/title/$id"
      params={{ id: title.id }}
      className="group flex min-w-0 gap-3 rounded-xl border border-line p-3 transition-colors hover:border-accent hover:bg-fg/5"
      aria-label={`Open title workspace for ${title.name}`}
    >
      <div className="w-24 shrink-0">
        {assetsQ.isPending ? (
          <div className="grid aspect-[2/3] place-items-center rounded-xl border border-line bg-elevated px-2 text-center text-xs text-muted">
            Loading poster…
          </div>
        ) : assetsQ.isError ? (
          <div className="grid aspect-[2/3] place-items-center rounded-xl border border-line bg-elevated px-2 text-center text-xs text-muted">
            Poster status unavailable
          </div>
        ) : (
          <AssetPosterSlot assets={assetsQ.data?.assets ?? []} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 py-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5">{title.name}</p>
          <p className="mt-1 text-xs text-muted">
            {title.language}
            {title.year ? ` · ${title.year}` : ""}
          </p>
          <p className="mt-2 break-all text-[10px] text-muted">ID: {title.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold">
            {title.status === "DELIVERED" ? "DELIVERED" : "OPEN TITLE"}
          </span>
          <span className="text-[10px] font-semibold text-muted group-hover:text-fg">OPEN TITLE →</span>
        </div>
      </div>
    </Link>
  );
}
