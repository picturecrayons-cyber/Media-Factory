import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/workspace")({ component: Workspace });

function Workspace() {
  const [showCreate,setShowCreate]=useState(false);
  return <RequireBridge>{(actor)=>{
    const canCreate=hasPermission(actor,"title.create");
    return <BridgeShell actor={actor} title="Titles">
      <div className="space-y-6">
        <section className="rounded-3xl border border-line bg-surface p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold">Title workspace</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted">Each title keeps files, metadata, QC, rights, licensing, delivery, team and billing together.</p>
            </div>
            {canCreate?<Button onClick={()=>setShowCreate(!showCreate)} className="rounded-full">{showCreate?"Close":"New title"}</Button>:null}
          </div>
        </section>

        {showCreate&&canCreate?<section className="rounded-3xl border border-line bg-surface p-6"><CreateTitleForm /></section>:null}

        <section className="rounded-3xl border border-line bg-surface p-6">
          <TitleList empty="No titles available for this workspace." />
        </section>
      </div>
    </BridgeShell>;
  }}</RequireBridge>;
}
