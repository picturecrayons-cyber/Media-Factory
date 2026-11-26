import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/workspace")({ component: Workspace });

function Workspace() {
  const [query,setQuery]=useState("");
  const search=useMemo(()=>query.trim(),[query]);
  return <RequireBridge allow="workspace">{(actor)=>{
    const canCreate=hasPermission(actor,"title.create");
    return <BridgeShell actor={actor} title="Titles">
      <div className="space-y-5">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold">Title library</h2>
              <p className="mt-1 text-sm text-muted">Search and open the canonical Bridge record for every title.</p>
            </div>
            {canCreate && !actor.internalRole && ["studio", "independent_creator"].includes(actor.accountType) ? (
              <div className="flex flex-wrap gap-2">
                <Link to="/submit-film" className="rounded-full bg-fg px-5 py-2 text-sm font-semibold text-bg">New Finished Film</Link>
                <Link to="/submit-concept" className="rounded-full border border-line px-5 py-2 text-sm font-semibold">New Story / Concept</Link>
              </div>
            ) : null}
          </div>
          <input aria-label="Search Bridge products" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search films and stories…" className="mt-5 h-10 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm sm:max-w-md" />
        </section>
        <section aria-label="Primary Bridge products" className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Primary product 01</p>
            <h2 className="mt-2 font-display text-xl font-semibold">Finished Films</h2>
            <p className="mt-2 text-sm text-muted">Completed films submitted for asset verification, QC, rights and legal review, licensing, delivery and revenue workflows.</p>
            {canCreate && !actor.internalRole && ["studio", "independent_creator"].includes(actor.accountType) ? (
              <Link to="/submit-film" className="mt-4 inline-flex rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">Submit Finished Film</Link>
            ) : null}
          </article>
          <article className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Primary product 02</p>
            <h2 className="mt-2 font-display text-xl font-semibold">Stories / Concepts</h2>
            <p className="mt-2 text-sm text-muted">Ideas, scripts and pitches submitted into a separate curation workflow before any approved buyer or investor introduction.</p>
            {canCreate && !actor.internalRole && ["studio", "independent_creator"].includes(actor.accountType) ? (
              <Link to="/submit-concept" className="mt-4 inline-flex rounded-full border border-line px-4 py-2 text-sm font-semibold">Submit Story / Concept</Link>
            ) : null}
          </article>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="mb-4">
            <h3 className="font-display text-lg font-semibold">Canonical title register</h3>
            <p className="mt-1 text-sm text-muted">One searchable register for both products. Select a record to open its canonical Bridge workspace; product type and workflow status remain visible.</p>
          </div>
          <TitleList empty="No products are available for this workspace." query={search} excludeTestFixtures={actor.accountType === "studio" && !actor.internalRole} />
        </section>
      </div>
    </BridgeShell>;
  }}</RequireBridge>;
}