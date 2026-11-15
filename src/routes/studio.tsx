import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CheckCircle2,
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
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
  });
  const titles = titlesQuery.data?.titles ?? [];
  const counts = useMemo(() => {
    return titles.reduce(
      (result, title) => {
        result.total += 1;
        if (title.status === "DRAFT") result.draft += 1;
        if (title.status === "UPLOADING") result.uploading += 1;
        if (title.status === "PREPARING") result.preparing += 1;
        if (title.status === "QC_REVIEW") result.review += 1;
        if (["LICENSING_READY", "LIVE_FOR_BUYERS", "LICENSED", "DELIVERED"].includes(title.status)) result.cleared += 1;
        return result;
      },
      { total: 0, draft: 0, uploading: 0, preparing: 0, review: 0, cleared: 0 },
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
        <div className="mt-8 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2 xl:grid-cols-4">
          <HeroMetric icon={Film} label="Studio titles" value={titlesQuery.isError ? "—" : String(counts.total)} />
          <HeroMetric icon={HardDrive} label="Uploading" value={titlesQuery.isError ? "—" : String(counts.uploading)} />
          <HeroMetric icon={ShieldCheck} label="In review" value={titlesQuery.isError ? "—" : String(counts.review)} />
          <HeroMetric icon={CheckCircle2} label="At release stage" value={titlesQuery.isError ? "—" : String(counts.cleared)} />
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
              titlesLoading={titlesQuery.isPending}
              titlesError={titlesQuery.isError}
              onNavigate={setActiveTab}
            />
          ) : null}
          {activeTab === "productions" ? <ProductionPanel actor={actor} titles={titles} loading={titlesQuery.isPending} error={titlesQuery.isError} onRetry={() => void titlesQuery.refetch()} /> : null}
          {activeTab === "titles" ? <TitlesPanel /> : null}
          {activeTab === "dit" ? <DitPanel actor={actor} /> : null}
          {activeTab === "members" ? <MembersPanel /> : null}
        </main>
      </div>
    </div>
  );
}

function HeroMetric({ icon: Icon, label, value }: { icon: typeof Film; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3.5">
      <span className="rounded-xl bg-white/10 p-2.5 text-[#dfc48e]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <span><span className="block text-xs text-slate-400">{label}</span><strong className="mt-0.5 block text-xl font-semibold tabular-nums text-white">{value}</strong></span>
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
  counts: { total: number; draft: number; uploading: number; preparing: number; review: number; cleared: number };
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
        <div className="sm:min-w-[250px]"><NewSubmissionPanel /></div>
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

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Your slate</p><h3 className="mt-1 font-display text-xl font-semibold">Recent studio titles</h3></div>
          <button type="button" onClick={() => onNavigate("productions")} className="text-sm font-semibold text-accent hover:underline">View production slate</button>
        </div>
        <div className="mt-4"><TitleList empty="No finished-film submissions are available for this Studio organization yet." /></div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <QuickLink icon={Clapperboard} title="Production & media" description="View film-linked production assets, storage verification and the handover desk." onClick={() => onNavigate("productions")} />
        <QuickLink icon={Users} title="Studio team" description="View the verified organization roster and current membership roles." onClick={() => onNavigate("members")} />
      </section>

      <p className="rounded-xl border border-line bg-elevated/40 p-4 text-xs leading-5 text-muted">
        Member visibility and title access are checked by Bridge on the server. Counts above reflect records returned to this signed-in account; missing or unavailable data is never replaced with estimates.
      </p>
    </div>
  );
}

function QuickLink({ icon: Icon, title, description, onClick }: { icon: typeof Film; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-accent hover:shadow-sm">
      <span className="rounded-xl bg-accent-soft p-3 text-accent"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <span><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs leading-5 text-muted">{description}</span></span>
    </button>
  );
}

function ProductionPanel({
  actor,
  titles,
  loading,
  error,
  onRetry,
}: {
  actor: BridgeActor;
  titles: Array<{ id: string; name: string; status: string; language: string; year?: number | null; contentType?: string | null }>;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Production control</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Your production slate</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Each finished-film title is the canonical production record. Verified media assets stay linked to that title; originals remain in their existing OCI locations.</p>
      </header>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-display text-lg font-semibold">Productions & titles</h3><p className="mt-1 text-xs text-muted">Live title records returned by Bridge for this account.</p></div>
          <button type="button" onClick={onRetry} className="rounded-full border border-line px-4 py-2 text-xs font-semibold hover:border-accent">Refresh</button>
        </div>
        <div className="mt-4">
          {loading ? <p className="text-sm text-muted">Loading production slate…</p> : null}
          {error ? <div role="alert" className="flex items-center gap-3 text-sm text-muted"><span>Production slate unavailable.</span><button type="button" onClick={onRetry} className="font-semibold text-accent underline">Retry</button></div> : null}
          {!loading && !error ? <TitleList empty="No production titles are returned for this account yet." /> : null}
        </div>
      </section>
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

function TitlesPanel() {
  return (
    <div className="space-y-6">
      <header><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Catalogue management</p><h2 className="mt-1 font-display text-2xl font-semibold">Titles & concepts</h2><p className="mt-1 text-sm text-muted">Keep completed-film submissions separate from original story and concept submissions.</p></header>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display text-lg font-semibold">Finished films</h3><p className="mt-1 text-xs text-muted">Open a title to manage metadata, verified files and workflow status.</p></div><NewSubmissionPanel /></div><div className="mt-4"><TitleList empty="No finished-film submissions are available for this Studio organization yet." /></div></section>
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
