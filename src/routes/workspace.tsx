import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/workspace")({ component: Workspace });

function Workspace() {
  const [showCreate,setShowCreate]=useState(false);
  const [query,setQuery]=useState("");
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
          <input aria-label="Search titles" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search titles…" className="mt-5 h-10 w-full rounded-xl border border-line-strong bg-elevated px-3 text-sm sm:max-w-md" />
        </section>
        {showCreate&&canCreate?<section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h3 className="font-display text-xl font-semibold">New Title</h3><p className="mt-1 mb-4 text-sm text-muted">Start with the essentials. You can complete metadata inside the Title Workspace.</p><CreateTitleForm concise /></section>:null}
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><TitleList empty="No titles available for this workspace." query={search} /></section>
      </div>
    </BridgeShell>;
  }}</RequireBridge>;
}
