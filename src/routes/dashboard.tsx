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
  return (
    <RequireBridge>
      {(actor) => {
        const canCreate = hasPermission(actor, "title.create");
        return (
          <BridgeShell actor={actor} title="Dashboard">
            <DashboardContent actor={actor} canCreate={canCreate} showCreate={showCreate} setShowCreate={setShowCreate} />
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}

function DashboardContent({
  actor,
  canCreate,
  showCreate,
  setShowCreate,
}: {
  actor: any;
  canCreate: boolean;
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
}) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = titlesQ.data?.titles ?? [];
  const actionItems = titles.filter((t) => t.status !== "DELIVERED");
  const readyCount = titles.filter((t) => ["LICENSING_READY", "LIVE_FOR_BUYERS", "LICENSED", "DELIVERED"].includes(t.status)).length;
  const deliveredCount = titles.filter((t) => t.status === "DELIVERED").length;
  const currentRole = actor.internalRole?.replaceAll("_", " ") || actor.accountType.replaceAll("_", " ");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">Bridge active</span>
              <span className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted">{currentRole}</span>
            </div>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Content to market, without the clutter.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Upload, clear, license and deliver. Bridge only shows the next useful action for each title.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canCreate ? (
              <Button onClick={() => setShowCreate(!showCreate)} className="h-11 rounded-full px-6 font-semibold">
                {showCreate ? "Close form" : "+ Add title"}
              </Button>
            ) : null}
            <Link to="/account" className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-fg">
              Account
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Titles" value={titles.length} detail="Canonical records" />
        <SummaryCard label="Needs action" value={actionItems.length} detail="Open workflow items" accent />
        <SummaryCard label="Market ready" value={readyCount} detail="Rights / licensing ready" />
        <SummaryCard label="Delivered" value={deliveredCount} detail="Authorized delivery complete" />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Your flow</p>
            <h3 className="mt-1 font-display text-2xl font-semibold text-fg">Five clear steps</h3>
          </div>
          <span className="hidden text-xs text-muted sm:inline">Each gate is verified separately</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          {[
            ["1", "Upload", "Master + artwork"],
            ["2", "QC", "Technical checks"],
            ["3", "Rights", "Ownership + windows"],
            ["4", "License", "Buyer approval"],
            ["5", "Deliver", "Authorized handoff"],
          ].map(([num, label, detail]) => (
            <div key={num} className="rounded-2xl border border-line bg-elevated/60 p-4">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-surface text-xs font-bold text-accent shadow-sm">{num}</span>
              <p className="mt-3 text-sm font-semibold text-fg">{label}</p>
              <p className="mt-1 text-xs text-muted">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      {showCreate && canCreate ? (
        <section className="rounded-3xl border border-accent/30 bg-surface p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">New title</p>
          <h3 className="mt-1 font-display text-2xl font-semibold">Create the title record</h3>
          <p className="mt-2 text-sm text-muted">Start with the essentials. Upload, QC and rights stay as separate steps.</p>
          <div className="mt-6"><CreateTitleForm /></div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Titles</p>
              <h3 className="mt-1 font-display text-2xl font-semibold">Your catalog</h3>
            </div>
            {canCreate ? <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowCreate(true)}>+ Add title</Button> : null}
          </div>
          <div className="mt-5"><TitleList empty="No titles yet. Add your first title to begin." /></div>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Next</p>
              <h3 className="mt-1 font-display text-2xl font-semibold">Needs attention</h3>
            </div>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">{actionItems.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {actionItems.slice(0, 5).map((t) => (
              <Link key={t.id} to="/title/$id" params={{ id: t.id }} className="block rounded-2xl border border-line bg-elevated/60 p-4 transition hover:border-line-strong">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{t.name}</p>
                    <p className="mt-1 text-xs text-muted">{nextAction(t.status)}</p>
                  </div>
                  <span className="shrink-0 text-lg text-accent">→</span>
                </div>
              </Link>
            ))}
            {actionItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line p-6 text-center">
                <p className="text-sm font-medium text-fg">Nothing waiting</p>
                <p className="mt-1 text-xs text-muted">Open items will appear here.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, detail, accent = false }: { label: string; value: number; detail: string; accent?: boolean }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={`mt-2 font-display text-3xl font-semibold ${accent ? "text-accent" : "text-fg"}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </article>
  );
}

function nextAction(status: string) {
  if (status === "DRAFT" || status === "UPLOADING") return "Complete title details and upload assets";
  if (status === "PREPARING" || status === "QC_REVIEW") return "Finish technical QC";
  if (status === "RIGHTS_REVIEW") return "Clear rights and availability";
  if (status === "LICENSING_READY" || status === "LIVE_FOR_BUYERS") return "Review licensing activity";
  if (status === "IN_NEGOTIATION") return "Continue buyer negotiation";
  if (status === "LICENSED") return "Authorize and complete delivery";
  return "Review title";
}
