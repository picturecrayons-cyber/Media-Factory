import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { StreamVistaOrders } from "@/components/bridge/streamvista-orders";
import { StatusChip } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator workspace">
          <CreatorBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function CreatorBody() {
  const [showCreate, setShowCreate] = useState(false);
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), retry: false });
  const titles = titlesQ.data?.titles ?? [];
  const inReview = titles.filter((t) => ["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(t.status)).length;
  const buyerReady = titles.filter((t) => ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(t.status)).length;
  const nextStep = !titles.length ? "Create your first title" :
    titles.some((t) => t.status === "DRAFT") ? "Complete the title details and upload required assets" :
    titles.some((t) => ["UPLOADING", "PREPARING"].includes(t.status)) ? "Check the upload and ingest status" :
    titles.some((t) => ["QC_REVIEW", "RIGHTS_REVIEW"].includes(t.status)) ? "Bridge review is in progress" :
    titles.some((t) => t.status === "LICENSING_READY") ? "Your title is ready for licensing review" :
    "Open a title to review its latest status";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Creator · one simple workflow</p>
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Your titles, their next step.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Create a title once, upload its media and rights evidence, then track Bridge review and authorized delivery from one place. You can only manage titles belonging to your account.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => setShowCreate((v) => !v)} className="rounded-full px-5">{showCreate ? "Close form" : "＋ Create title"}</Button>
          <Link to="/account" className="inline-flex items-center rounded-full border border-line px-5 py-2 text-sm font-semibold">Account & verification</Link>
        </div>
      </section>

      <section aria-label="Your title summary" className="grid gap-3 sm:grid-cols-3">
        <Summary label="My titles" value={titlesQ.isPending ? "—" : String(titles.length)} note="Titles owned by your account" />
        <Summary label="In preparation / review" value={titlesQ.isPending ? "—" : String(inReview)} note="Upload, QC or rights workflow" />
        <Summary label="Licensing pipeline" value={titlesQ.isPending ? "—" : String(buyerReady)} note="Not a guarantee of a deal or revenue" />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Recommended next step</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-semibold">{nextStep}</h3><p className="mt-1 text-sm text-muted">Bridge authorizes rights and distribution; Loop delivers only after approval.</p></div>
          {!titles.length || titles.some((t) => t.status === "DRAFT") ? <Button variant="outline" onClick={() => setShowCreate(true)} className="rounded-full">Continue title setup</Button> : <Link to="/workspace" className="inline-flex rounded-full border border-line px-4 py-2 text-sm font-semibold">Open title library</Link>}
        </div>
      </section>

      {showCreate ? <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h3 className="font-display text-xl font-semibold">Create a title</h3><p className="mt-1 mb-4 text-sm text-muted">Start with the title and language. Add full metadata, assets and rights inside its workspace.</p><CreateTitleForm concise /></section> : null}

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-display text-xl font-semibold">My titles</h3><p className="mt-1 text-sm text-muted">Select a title to continue its workflow.</p></div><Link to="/workspace" className="text-sm font-semibold text-accent">Full library →</Link></div>
        {titlesQ.isError ? <div role="alert" className="text-sm text-muted">Your title list could not be loaded. <button className="underline" onClick={() => void titlesQ.refetch()}>Retry</button></div> : <TitleList empty="No titles yet. Create your first draft to begin." />}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h3 className="font-display text-xl font-semibold">Optional production services</h3>
        <p className="mt-1 text-sm text-muted">Request subtitling, dubbing, audio description, post-production or OTT packaging. Service orders are separate from title rights and licensing revenue.</p>
        <div className="mt-4"><StreamVistaOrders /></div>
      </section>
      <p className="text-xs leading-5 text-muted">Status labels reflect current Bridge records. They do not certify OCI storage, legal rights, completed delivery or collected revenue.</p>
    </div>
  );
}

function Summary({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs uppercase tracking-wider text-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted">{note}</p></article>;
}

export function Desk({ role, scope, opportunity, steps }: { role: string; scope: string; opportunity: string; steps: string[] }) {
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><article className="rounded-sm border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Scope · {role}</p><p className="mt-2 text-sm">{scope}</p></article><article className="rounded-sm border border-line p-4"><p className="text-xs uppercase tracking-widest text-muted">Opportunity</p><p className="mt-2 text-sm">{opportunity}</p></article></div><ol className="flex flex-wrap gap-2 text-sm">{steps.map((step, i) => <li key={step} className="rounded-sm border border-line px-3 py-1.5">{i + 1}. {step}</li>)}</ol></div>;
}
