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
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="mb-4">
            <h3 className="font-display text-lg font-semibold">Bridge product library</h3>
            <p className="mt-1 text-sm text-muted">Finished Films and Stories / Concepts are separate product pipelines. Each opens its canonical Bridge record.</p>
          </div>
          <TitleList empty="No products are available for this workspace." query={search} />
        </section>
      </div>
    </BridgeShell>;
  }}</RequireBridge>;
}