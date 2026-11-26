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
            {canCreate?<div className="flex flex-wrap gap-2"><Link to="/submit-film" className="rounded-full bg-fg px-5 py-2 text-sm font-semibold text-bg">New Finished Film</Link>{actor.accountType === "studio" && !actor.internalRole ? <Link to="/submit-concept" className="rounded-full border border-line px-5 py-2 text-sm font-semibold">Story / Concept</Link> : null}</div>:null}
          </div>
          <input aria-label="Search titles" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search titles…" className="mt-5 h-10 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm sm:max-w-md" />
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><TitleList empty="No titles available for this workspace." query={search} /></section>
      </div>
    </BridgeShell>;
  }}</RequireBridge>;
}