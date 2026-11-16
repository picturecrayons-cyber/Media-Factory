import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronRight,
  Clapperboard,
  Film,
  HardDrive,
  Layers3,
  ShieldCheck,
  Users,
} from "lucide-react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import { listTitles } from "@/lib/bridge/titles";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { listProductionAssets } from "@/lib/bridge/assets";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/studio")({ component: Studio });

type StudioTab = "overview" | "productions" | "titles" | "dit" | "members";

const navItems: Array<{ id: StudioTab; label: string; icon: typeof Film; description: string }> = [
  { id: "overview", label: "Overview", icon: Layers3, description: "Studio activity and next actions" },
  { id: "productions", label: "Productions", icon: Clapperboard, description: "Your film production slate" },
  { id: "titles", label: "Titles & concepts", icon: Film, description: "Submissions and review status" },
  { id: "dit", label: "DIT & media", icon: HardDrive, description: "Camera-card ingest and vault verification" },
  { id: "members", label: "Members", icon: Users, description: "Verified organization roster" },
];

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio workspace">
          <StudioWorkspace actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function StudioWorkspace({ actor }: { actor: BridgeActor }) {
  const [activeTab, setActiveTab] = useState<StudioTab>("overview");
  const titlesQuery = useQuery({
    queryKey: ["bridge-titles", actor.userId, actor.organizationId ?? null, actor.accountType, actor.internalRole ?? null],
    queryFn: () => listTitles(),
  });
  const conceptsQuery = useQuery({ queryKey: ["my-story-concepts"], queryFn: () => listMyStoryConcepts() });
  const conceptTitleIds = new Set((conceptsQuery.data?.concepts ?? []).map((concept) => concept.title_id));
  // Keep Story / Concept records out of the finished-film production slate.
  const titles = conceptsQuery.isSuccess ? (titlesQuery.data?.titles ?? []).filter((title) => !conceptTitleIds.has(title.id)) : [];
  const titlesLoading = titlesQuery.isPending || conceptsQuery.isPending;
  const titlesError = titlesQuery.isError || conceptsQuery.isError;
  const counts = useMemo(() => {
    return titles.reduce(
      (result, title) => {
        if (title.status === "UPLOADING") result.uploading += 1;
        if (title.status === "PREPARING") result.preparing += 1;
        if (title.status === "QC_REVIEW") result.review += 1;
        return result;
      },
      { uploading: 0, preparing: 0, review: 0 },
    );
  }, [titles]);

  const nextActions = [
    { label: "Continue uploads", value: counts.uploading, hint: "Titles with an upload in progress", tab: "titles" as const },
    { label: "Complete preparation", value: counts.preparing, hint: "Titles ready for the next review step", tab: "titles" as const },
    { label: "Review queue", value: counts.review, hint: "Titles currently in QC review", tab: "titles" as const },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1 pb-16 sm:space-y-8">
      <header className="relative isolate overflow-hidden rounded-3xl bg-[#101d2b] px-5 py-7 text-white shadow-xl shadow-slate-900/10 sm:px-8 sm:py-9">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 -z-10 h-96 w-96 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-2 -top-16 -z-10 h-64 w-64 rounded-full border border-[#d7b878]/25" />
        <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7b878]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#d7b878]" /> Crayons Bridge · Studio workspace
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{actor.organizationName || actor.displayName}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              One workspace for your film slate, verified media, production handover and studio team.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-xs text-slate-200">
              <ShieldCheck className="h-4 w-4 text-[#d7b878]" aria-hidden="true" />
              Verified Studio access · Organization-scoped records
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/deliveries" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
              Deliveries <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/account" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
              Studio account
            </Link>
          </div>
        </div>
          {titlesQuery.isError ? (
          <p className="mt-4 text-xs text-amber-200" role="status">Live title totals are unavailable. Open Titles to retry; no estimates are shown.</p>
        ) : null}
      </header>

      <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-line bg-surface p-2 xl:sticky xl:top-24">
          <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Workspace</p>
          <nav aria-label="Studio workspace">
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = item.id === activeTab;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={selected ? "page" : undefined}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected ? "bg-[#102c3d] text-white shadow-sm" : "text-fg hover:bg-elevated"}`}
                >
                  <span className={`rounded-lg p-2 ${selected ? "bg-white/10 text-[#e0c58f]" : "bg-elevated text-muted group-hover:text-fg"}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className={`mt-0.5 block text-[11px] ${selected ? "text-slate-300" : "text-muted"}`}>{item.description}</span>
                  </span>
                  <ChevronRight className={`h-4 w-4 ${selected ? "text-[#e0c58f]" : "text-muted"}`} aria-hidden="true" />
                </button>
              );
            })}
          </nav>
          <div className="mt-3 border-t border-line px-3 py-3">
            <p className="text-xs font-semibold">Need a hand?</p>
            <p className="mt-1 text-xs leading-5 text-muted">Use the existing Bridge support channel for account and production workflow assistance.</p>
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          {activeTab === "overview" ? (
            <OverviewPanel
              counts={counts}
              nextActions={nextActions}
              titlesLoading={titlesLoading}
              titlesError={titlesError}
              onNavigate={setActiveTab}
            />
          ) : null}
          {activeTab === "productions" ? <ProductionPanel actor={actor} titles={titles} loading={titlesLoading} error={titlesError} /> : null}
          {activeTab === "titles" ? <TitlesPanel conceptTitleIds={Array.from(conceptTitleIds)} conceptsLoading={conceptsQuery.isPending} conceptsError={conceptsQuery.isError} /> : null}
          {activeTab === "dit" ? <DitPanel actor={actor} /> : null}
          {activeTab === "members" ? <MembersPanel /> : null}
        </main>
      </div>
    </div>
  );
}

function OverviewPanel({
  counts,
  nextActions,
  titlesLoading,
  titlesError,
  onNavigate,
}: {
  counts: { uploading: number; preparing: number; review: number };
  nextActions: Array<{ label: string; value: number; hint: string; tab: StudioTab }>;
  titlesLoading: boolean;
  titlesError: boolean;
  onNavigate: (tab: StudioTab) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Command centre</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Studio overview</h2>
          <p className="mt-1 text-sm text-muted">A clear view of titles, media handover and the work that needs attention.</p>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3" aria-label="Next actions">
        {nextActions.map((action) => (
          <button key={action.label} type="button" onClick={() => onNavigate(action.tab)} className="rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-accent hover:shadow-sm">
            <span className="text-xs font-medium text-muted">{action.label}</span>
            <strong className="mt-2 block text-3xl font-semibold tabular-nums">{titlesLoading || titlesError ? "—" : action.value}</strong>
            <span className="mt-1 block text-xs text-muted">{action.hint}</span>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent">Open workspace <ArrowUpRight className="h-3.5 w-3.5" /></span>
          </button>
        ))}
      </section>

      <p className="text-xs leading-5 text-muted">
        Studio titles and member visibility are authorized by Bridge on the server. Unavailable data is never replaced with estimates.
      </p>
    </div>
  );
}

function ProductionPanel({
  actor,
  titles,
  loading,
  error,
}: {
  actor: BridgeActor;
  titles: Array<{ id: string; name: string; status: string; language: string; year?: number | null; contentType?: string | null }>;
  loading: boolean;
  error: boolean;
}) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Production control</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Your production slate</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Each finished-film title is the canonical production record. Verified media assets stay linked to that title; originals remain in their existing OCI locations.</p>
      </header>
      <section className="space-y-3">
        <div><h3 className="font-display text-lg font-semibold">Production assets</h3><p className="text-sm text-muted">Verified files connected to each title.</p></div>
        {loading ? <p className="text-sm text-muted">Loading production asset register…</p> : null}
        {!loading && !error && titles.length === 0 ? <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">No production assets are available without a production title.</p> : null}
        {!loading && !error ? <div className="space-y-3">{titles.slice(0, 20).map((title) => <ProductionAssetCard key={title.id} title={title} actor={actor} />)}</div> : null}
      </section>
      <p className="rounded-xl border border-line p-4 text-xs leading-5 text-muted">Bridge currently connects the production slate to canonical film titles and verified media references. A separate shoot calendar, crew call sheet and cost ledger are not yet connected; they are not represented as active tools here.</p>
    </div>
  );
}

function ProductionAssetCard({ title, actor }: { title: { id: string; name: string; status: string }; actor: BridgeActor }) {
  const query = useQuery({
    queryKey: ["bridge-production-assets", title.id, actor.userId, actor.internalRole ?? actor.accountType],
    queryFn: () => listProductionAssets({ data: { titleId: title.id } }),
  });
  const assets = query.data?.assets ?? [];
  return (
    <article className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><Link to="/title/$id" params={{ id: title.id }} className="font-semibold hover:text-accent">{title.name}</Link><p className="mt-1 text-xs text-muted">Production · {title.status.replaceAll("_", " ")}</p></div>
        <Link to="/title/$id" params={{ id: title.id }} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent">Open title <ArrowUpRight className="h-3.5 w-3.5" /></Link>
      </div>
      {query.isPending ? <p className="mt-3 text-xs text-muted">Loading verified media references…</p> : null}
      {query.isError ? <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted" role="alert"><span>Production asset register unavailable for this title.</span><button type="button" onClick={() => void query.refetch()} className="font-semibold text-accent underline">Retry</button></div> : null}
      {!query.isPending && !query.isError ? (
        assets.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <AssetCount label="Linked files" value={assets.length} />
            <AssetCount label="Verified sources" value={assets.filter((asset) => asset.verifiedSource).length} />
            <AssetCount label="Needs source check" value={assets.filter((asset) => !asset.verifiedSource).length} />
          </div>
        ) : <p className="mt-3 rounded-lg border border-dashed border-line p-3 text-xs text-muted">No verified files are linked to this Production register yet. Original objects are not moved.</p>
      ) : null}
    </article>
  );
}

function AssetCount({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-elevated/60 p-3"><span className="block text-[11px] text-muted">{label}</span><strong className="mt-1 block text-lg tabular-nums">{value}</strong></div>;
}

function TitlesPanel({ conceptTitleIds, conceptsLoading, conceptsError }: { conceptTitleIds: string[]; conceptsLoading: boolean; conceptsError: boolean }) {
  return (
    <div className="space-y-6">
      <header><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Catalogue management</p><h2 className="mt-1 font-display text-2xl font-semibold">Titles & concepts</h2><p className="mt-1 text-sm text-muted">Keep completed-film submissions separate from original story and concept submissions.</p></header>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display text-lg font-semibold">Finished films</h3><p className="mt-1 text-xs text-muted">Open a title to manage metadata, verified files and workflow status.</p></div><NewSubmissionPanel /></div><div className="mt-4">{conceptsLoading ? <p className="text-sm text-muted">Checking submission types…</p> : conceptsError ? <p role="alert" className="text-sm text-muted">Finished-film records are hidden because Story / Concept classification could not be verified.</p> : <TitleList empty="No finished-film submissions are available for this Studio organization yet." excludeIds={conceptTitleIds} />}</div></section>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><MyStoryConcepts /></section>
    </div>
  );
}

function DitPanel({ actor }: { actor: BridgeActor }) {
  return (
    <div className="space-y-5">
      <header><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Camera to cloud</p><h2 className="mt-1 font-display text-2xl font-semibold">DIT & media handover</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Ingest original camera cards into OCI Primary, verify the independent Recovery copy and record DIT sign-off against the registered source manifest.</p></header>
      <DitAgentDesk actor={actor} />
    </div>
  );
}

function MembersPanel() {
  return (
    <div className="space-y-5">
      <header><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Organization</p><h2 className="mt-1 font-display text-2xl font-semibold">Studio members</h2><p className="mt-1 text-sm text-muted">Authenticated organization roster. Role and invitation controls stay disabled until implemented and separately approved.</p></header>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><StudioMemberDesk /></section>
    </div>
  );
}
