import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  const [showCreate, setShowCreate] = useState(false);
  return <RequireBridge>{(actor) => <BridgeShell actor={actor} title="Dashboard"><DashboardBody actor={actor} canCreate={hasPermission(actor,"title.create")} showCreate={showCreate} setShowCreate={setShowCreate} /></BridgeShell>}</RequireBridge>;
}

function DashboardBody({ actor, canCreate, showCreate, setShowCreate }: { actor:any; canCreate:boolean; showCreate:boolean; setShowCreate:(v:boolean)=>void }) {
  const titlesQ = useQuery({ queryKey:["bridge-titles"], queryFn:()=>listTitles() });
  const titles = titlesQ.data?.titles ?? [];
  const review = titles.filter((t)=>["PREPARING","QC_REVIEW","RIGHTS_REVIEW"].includes(t.status)).length;
  const deals = titles.filter((t)=>["IN_NEGOTIATION","LICENSED"].includes(t.status)).length;
  const delivered = titles.filter((t)=>t.status==="DELIVERED").length;

  return <div className="space-y-6">
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted">Signed in as {actor.accountType.replaceAll("_"," ")}</p>
          <h2 className="mt-2 max-w-3xl font-display text-3xl font-semibold sm:text-4xl">One bridge from content to market.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Open a title, prepare assets, clear rights, license, and deliver. Each step stays in one title workspace.</p>
        </div>
        {canCreate ? <Button onClick={()=>setShowCreate(!showCreate)} className="rounded-full px-6">{showCreate?"Close":"New title"}</Button> : null}
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Titles",titles.length],
        ["In review",review],
        ["Active deals",deals],
        ["Delivered",delivered],
      ].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-line bg-surface p-5"><p className="text-xs uppercase tracking-wider text-muted">{label}</p><p className="mt-2 font-display text-3xl font-semibold">{value}</p></div>)}
    </section>

    {showCreate && canCreate ? <section className="rounded-3xl border border-line bg-surface p-6"><div className="mb-5"><h3 className="font-display text-2xl font-semibold">Create title</h3><p className="mt-1 text-sm text-muted">Create the canonical Bridge title record. Upload and rights approval happen next.</p></div><CreateTitleForm /></section> : null}

    <section className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
      <div className="rounded-3xl border border-line bg-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-wider text-muted">Catalog</p><h3 className="mt-1 font-display text-2xl font-semibold">Your titles</h3></div>
          {canCreate ? <Button size="sm" variant="outline" onClick={()=>setShowCreate(true)} className="rounded-full">New title</Button> : null}
        </div>
        <div className="mt-5"><TitleList empty="No titles yet." /></div>
      </div>

      <aside className="rounded-3xl border border-line bg-surface p-6">
        <p className="text-xs uppercase tracking-wider text-muted">Quick access</p>
        <div className="mt-4 grid gap-2">
          <Link to="/workspace" className="rounded-2xl border border-line p-4 text-sm font-medium hover:border-line-strong">Titles & workflow →</Link>
          {actor.internalRole ? <Link to="/internal" className="rounded-2xl border border-line p-4 text-sm font-medium hover:border-line-strong">Distribution →</Link> : null}
          {(actor.accountType==="buyer" || actor.internalRole) ? <Link to="/buyer" className="rounded-2xl border border-line p-4 text-sm font-medium hover:border-line-strong">Buyers & screeners →</Link> : null}
          <Link to="/account" className="rounded-2xl border border-line p-4 text-sm font-medium hover:border-line-strong">Account →</Link>
        </div>
      </aside>
    </section>
  </div>;
}
