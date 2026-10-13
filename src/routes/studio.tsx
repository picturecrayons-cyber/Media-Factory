import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { StreamVistaOrders } from "@/components/bridge/streamvista-orders";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return <RequireBridge allow="studio">{(actor) => <BridgeShell actor={actor} title="Studio workspace"><StudioBody /></BridgeShell>}</RequireBridge>;
}

function StudioBody() {
  const [showCreate, setShowCreate] = useState(false);
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), retry: false });
  const titles = titlesQ.data?.titles ?? [];
  const inReview = titles.filter((t) => ["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(t.status)).length;
  const buyerReady = titles.filter((t) => ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(t.status)).length;
  const draftCount = titles.filter((t) => t.status === "DRAFT").length;
  const nextStep = !titles.length ? "Add the first title to your slate" : draftCount ? "Complete draft details and upload required assets" : inReview ? "Review ingest, QC and rights status" : "Review the slate and buyer pipeline";

  return <div className="space-y-6">
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio · slate management</p>
      <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Your catalog, organized.</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Manage studio-owned titles, prepare a complete rights and media package, request production services and track each title through independent Bridge review. Team and title visibility remain limited to authorized access.</p>
      <div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => setShowCreate((v) => !v)} className="rounded-full px-5">{showCreate ? "Close form" : "＋ Add title"}</Button><Link to="/workspace" className="inline-flex items-center rounded-full border border-line px-5 py-2 text-sm font-semibold">Open title library</Link><Link to="/account" className="inline-flex items-center rounded-full border border-line px-5 py-2 text-sm font-semibold">Account</Link></div>
    </section>
    <section className="grid gap-3 sm:grid-cols-3">
      <Summary label="Studio titles" value={titlesQ.isPending ? "—" : String(titles.length)} note="Titles available to this studio account" />
      <Summary label="In preparation / review" value={titlesQ.isPending ? "—" : String(inReview)} note="Upload, QC or rights workflow" />
      <Summary label="Licensing pipeline" value={titlesQ.isPending ? "—" : String(buyerReady)} note="Pipeline status, not collected revenue" />
    </section>
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Recommended next step</p><div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">{nextStep}</h3><p className="mt-1 text-sm text-muted">Bridge reviews rights and QC before any title is buyer-visible or delivered.</p></div>{!titles.length || draftCount ? <Button variant="outline" onClick={() => setShowCreate(true)} className="rounded-full">Continue slate setup</Button> : <Link to="/workspace" className="inline-flex rounded-full border border-line px-4 py-2 text-sm font-semibold">Open title library</Link>}</div></section>
    {showCreate ? <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h3 className="font-display text-xl font-semibold">Add a title</h3><p className="mt-1 mb-4 text-sm text-muted">Create the canonical record first. Complete the full title package in its workspace.</p><CreateTitleForm concise /></section> : null}
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-display text-xl font-semibold">Studio slate</h3><p className="mt-1 text-sm text-muted">Open a title to continue ingest and review.</p></div><Link to="/workspace" className="text-sm font-semibold text-accent">Full library →</Link></div>{titlesQ.isError ? <div role="alert" className="text-sm text-muted">Studio titles could not be loaded. <button className="underline" onClick={() => void titlesQ.refetch()}>Retry</button></div> : <TitleList empty="No titles yet. Add the first title to start your slate." />}</section>
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h3 className="font-display text-xl font-semibold">Production services</h3><p className="mt-1 text-sm text-muted">Manage optional post-production and delivery-preparation service orders separately from licensing.</p><div className="mt-4"><StreamVistaOrders /></div></section>
    <p className="text-xs leading-5 text-muted">Status labels are operational records, not proof of verified OCI storage, legal rights clearance, completed delivery or reconciled cash revenue.</p>
  </div>;
}

function Summary({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs uppercase tracking-wider text-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted">{note}</p></article>;
}
