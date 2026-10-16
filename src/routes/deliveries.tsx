import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import type { BridgeActor } from "@/lib/bridge/session";
import { TITLE_STATUSES } from "@/lib/bridge/types";

export const Route = createFileRoute("/deliveries")({ component: Deliveries });

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

function VendorJobs({ actor }: { actor: BridgeActor }) {
  const canOpenAdminRecords = actor.internalRole === "super_admin" || actor.internalRole === "admin";

  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Vendor services</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Vendor request intake</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Dubbing, loudness checks, IMF or DCP packaging, and human QC require a persisted job record and human sign-off. None of these services creates an approved master automatically.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted">
          Not connected
        </span>
      </div>

      <div role="status" className="mt-4 rounded-xl border border-dashed border-line bg-elevated/40 p-4">
        <p className="text-sm font-semibold">Requests are not saved from this screen.</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Persistent vendor-job storage and tracking are not connected in this build. Request controls are withheld so an in-memory preview action cannot be mistaken for a real job. Use the title record to review existing delivery and publication evidence.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canOpenAdminRecords ? (
          <Link to="/admin/workstations" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-[#041018]">
            Open persisted delivery records
          </Link>
        ) : null}
        <Link to="/workspace" className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
          Open title library
        </Link>
      </div>
    </section>
  );
}

function DeliveryList() {
  const q = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const titles = q.data?.titles ?? [];
  const needle = query.trim().toLowerCase();
  const visible = titles.filter((title) => {
    const matchesQuery = !needle || `${title.name} ${title.language} ${title.status} ${title.contentType}`.toLowerCase().includes(needle);
    const matchesStatus = statusFilter === "ALL" || title.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  if (q.isPending) return <p className="text-sm text-muted">Loading canonical title records…</p>;
  if (q.isError) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Delivery data unavailable</h2>
        <p role="alert" className="mt-2 text-sm text-muted">Bridge could not load title records. No delivery state has been changed.</p>
        <Button className="mt-3" variant="outline" onClick={() => void q.refetch()}>Retry</Button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Canonical records</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Delivery desk</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
            Open a title to inspect its authoritative status and delivery workspace. Listing a title here does not mean its rights, QC, package, or delivery gates have passed.
          </p>
        </div>
        <span className="text-xs text-muted">{visible.length} of {titles.length} titles</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <input
          aria-label="Search delivery titles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, language, content type or status"
          className="h-10 w-full rounded-lg border border-line bg-transparent px-3 text-sm"
        />
        <select
          aria-label="Filter titles by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-line bg-transparent px-3 text-sm"
        >
          <option value="ALL">All statuses</option>
          {TITLE_STATUSES.map((status) => (
            <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 divide-y divide-line rounded-xl border border-line">
        {visible.map((title) => (
          <Link
            key={title.id}
            to="/title/$id"
            params={{ id: title.id }}
            className="flex flex-col gap-3 p-4 transition hover:bg-elevated/50 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="min-w-0">
              <span className="block font-semibold">{title.name}</span>
              <span className="mt-1 block text-xs text-muted">
                {title.language || "Language not set"}
                {title.year ? ` · ${title.year}` : ""}
                {title.contentType ? ` · ${title.contentType.replaceAll("_", " ")}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <StatusChip status={title.status as never} />
              <span className="text-sm font-semibold text-accent">Open title →</span>
            </span>
          </Link>
        ))}
        {!visible.length ? (
          <div className="p-6 text-sm text-muted">
            {titles.length ? "No titles match these filters. Clear the search or choose All statuses." : "No canonical title records are available for this account."}
          </div>
        ) : null}
      </div>
    </section>
  );
}
