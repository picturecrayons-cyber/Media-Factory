import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/bridge/rbac";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";

export const Route = createFileRoute("/workspace")({ component: Workspace });

function Workspace() {
  const [showCreate,setShowCreate]=useState(false);
  const [query,setQuery]=useState("");
  const [stageFilter,setStageFilter]=useState("all");
  const [laneFilter,setLaneFilter]=useState("all");
  const search=useMemo(()=>query.trim(),[query]);
  return <RequireBridge>{(actor)=>{
    const canCreate=hasPermission(actor,"title.create");
    return <BridgeShell actor={actor} title="Titles">
      <div className="space-y-5">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold">Title library</h2>
              <p className="mt-1 text-sm text-muted">Search and open the canonical Bridge record for every title.</p>
            </div>
            {canCreate?<Button onClick={()=>setShowCreate(!showCreate)} className="rounded-full px-5">{showCreate?"Cancel":"New Title"}</Button>:null}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <input aria-label="Search titles" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search title, language, year…" className="h-10 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm" />
            <label className="grid gap-1 text-xs text-muted">Content type
              <select aria-label="Filter by content type" value={laneFilter} onChange={(e)=>setLaneFilter(e.target.value)} className="h-10 rounded-xl border border-line-strong bg-elevated px-3 text-sm text-fg">
                <option value="all">All content types</option>
                {BRIDGE_LOOP_LANES.map((lane) => <option key={lane.id} value={lane.loopType}>{lane.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted">Business stage
              <select aria-label="Filter by business stage" value={stageFilter} onChange={(e)=>setStageFilter(e.target.value)} className="h-10 rounded-xl border border-line-strong bg-elevated px-3 text-sm text-fg">
                <option value="all">All stages</option>
                <option value="needs-decision">Needs a decision</option>
                <option value="ready-to-license">Ready to license</option>
                <option value="live">Live for buyers / licensed</option>
              </select>
            </label>
          </div>
        </section>
        {showCreate&&canCreate?<section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h3 className="font-display text-xl font-semibold">New Title</h3><p className="mt-1 mb-4 text-sm text-muted">Start with the essentials. You can complete metadata inside the Title Workspace.</p><CreateTitleForm concise /></section>:null}
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><TitleList empty="No titles match these filters." query={search} stageFilter={stageFilter} laneFilter={laneFilter} /></section>
      </div>
    </BridgeShell>;
  }}</RequireBridge>;
}
