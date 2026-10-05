import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import { hasPermission } from "@/lib/bridge/rbac";
import { requireBridgeRoute } from "@/lib/auth/route-guard";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: requireBridgeRoute,
  component: Dashboard,
});

function Dashboard() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <RequireBridge>
      {(actor) => {
        const canCreate = hasPermission(actor, "title.create");
        return (
          <BridgeShell
            actor={actor}
            title={actor.organizationName || actor.displayName || "Dashboard"}
          >
            <DashboardContent
              actor={actor}
              canCreate={canCreate}
              showCreate={showCreate}
              setShowCreate={setShowCreate}
            />
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

  const draftCount = titles.filter((t) => t.status === "DRAFT" || t.status === "UPLOADING").length;
  const inQcCount = titles.filter((t) => t.status === "PREPARING" || t.status === "QC_REVIEW").length;
  const inDealCount = titles.filter((t) => t.status === "IN_NEGOTIATION" || t.status === "LICENSED").length;
  const deliveredCount = titles.filter((t) => t.status === "DELIVERED").length;

  return (
    <div className="space-y-8">
      {/* Welcome & Overview Header */}
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Your Bridge · {actor.accountType.replaceAll("_", " ")}
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Good day, {actor.displayName || "Partner"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              One bridge from content to market. Upload masters, clear rights, license securely, and authorize delivery.
            </p>
          </div>
          {canCreate ? (
            <Button
              onClick={() => setShowCreate(!showCreate)}
              className="h-11 rounded-full px-6 font-semibold shadow-sm"
            >
              {showCreate ? "Hide Form" : "+ Add title"}
            </Button>
          ) : null}
        </div>

        {/* 5-Stage Primary Workflow Rail */}
        <div className="mt-8 border-t border-line pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Supply Chain Pipeline
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { num: "01", label: "UPLOAD", desc: "Master & Art" },
              { num: "02", label: "PREPARE", desc: "QC & Specs" },
              { num: "03", label: "RIGHTS", desc: "Territories" },
              { num: "04", label: "LICENSE", desc: "Buyer Deals" },
              { num: "05", label: "DELIVER", desc: "Authorized" },
            ].map((stg) => (
              <div
                key={stg.num}
                className="flex items-center gap-3 rounded-2xl border border-line bg-elevated p-3"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                  {stg.num}
                </span>
                <div>
                  <p className="text-xs font-bold text-fg">{stg.label}</p>
                  <p className="text-[11px] text-muted">{stg.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Summary KPI Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Total Titles</p>
          <p className="mt-2 font-display text-3xl font-semibold text-fg">{titles.length}</p>
          <p className="mt-1 text-xs text-muted">Active in catalog</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Needs Attention</p>
          <p className="mt-2 font-display text-3xl font-semibold text-accent">{draftCount + inQcCount}</p>
          <p className="mt-1 text-xs text-muted">{draftCount} drafts · {inQcCount} in review</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Active Deals</p>
          <p className="mt-2 font-display text-3xl font-semibold text-fg">{inDealCount}</p>
          <p className="mt-1 text-xs text-muted">In negotiation / licensed</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Deliveries</p>
          <p className="mt-2 font-display text-3xl font-semibold text-fg">{deliveredCount}</p>
          <p className="mt-1 text-xs text-muted">Authorized deliveries</p>
        </div>
      </section>

      {/* Add Title Form (Collapsible) */}
      {showCreate && canCreate ? (
        <section className="rounded-3xl border border-accent/30 bg-surface p-6 sm:p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Ingest</p>
            <h3 className="mt-1 font-display text-2xl font-semibold text-fg">Add new title</h3>
            <p className="mt-1 text-sm text-muted">
              Provide initial details to create the Bridge Title ID and open the title workspace.
            </p>
          </div>
          <CreateTitleForm />
        </section>
      ) : null}

      {/* Needs Your Attention Section */}
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Action Required</p>
            <h3 className="mt-1 font-display text-2xl font-semibold text-fg">Needs your attention</h3>
          </div>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
            {titles.filter((t) => t.status !== "DELIVERED").length} Pending
          </span>
        </div>

        <div className="mt-6 space-y-3">
          {titles.filter((t) => t.status === "DRAFT" || t.status === "UPLOADING").map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-elevated p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-fg">{t.name}</p>
                <p className="text-xs text-muted">Title is in draft. Complete metadata and upload master file.</p>
              </div>
              <Link to="/title/$id" params={{ id: t.id }}>
                <Button size="sm" className="rounded-full">Continue Ingest</Button>
              </Link>
            </div>
          ))}

          {titles.filter((t) => t.status === "QC_REVIEW" || t.status === "RIGHTS_REVIEW").map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-elevated p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-fg">{t.name}</p>
                <p className="text-xs text-muted">Awaiting QC inspection and rights clearance.</p>
              </div>
              <Link to="/title/$id" params={{ id: t.id }}>
                <Button size="sm" variant="outline" className="rounded-full">View Details</Button>
              </Link>
            </div>
          ))}

          {titles.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted">No pending action items right now.</p>
              {canCreate ? (
                <Button
                  onClick={() => setShowCreate(true)}
                  variant="outline"
                  className="mt-3 rounded-full text-xs"
                >
                  Create your first title
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* Your Titles Section */}
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex items-center justify-between pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Catalog</p>
            <h3 className="mt-1 font-display text-2xl font-semibold text-fg">Your titles</h3>
          </div>
          {canCreate ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreate(true)}
              className="rounded-full"
            >
              + Add title
            </Button>
          ) : null}
        </div>

        <div className="mt-4">
          <TitleList empty="No titles added yet. Click + Add title to begin." />
        </div>
      </section>
    </div>
  );
}
