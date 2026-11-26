import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";
import { isStudioTestFixtureTitle } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

const CONCEPT_STATUS: Record<string, string> = {
  PENDING: "Pending curation",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  INTRODUCED_TO_BUYERS: "Introduced to buyers",
};

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio Home">
          <StudioHome userId={actor.userId} organizationId={actor.organizationId} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function StudioHome({ userId, organizationId }: { userId: string; organizationId?: string | null }) {
  const titlesQ = useQuery({
    queryKey: ["bridge-titles", userId, organizationId],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const conceptsQ = useQuery({
    queryKey: ["my-story-concepts", userId, organizationId],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
    retry: 1,
  });

  const allTitles = (titlesQ.data?.titles ?? []).filter((title) => !isStudioTestFixtureTitle(title));
  const finishedFilms = allTitles.filter((title) => (title.submissionType ?? "finished_film") === "finished_film");
  const pendingFilms = finishedFilms.filter((title) =>
    ["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(title.status),
  );
  const recentFilms = [...finishedFilms].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);
  const concepts = conceptsQ.data?.concepts ?? [];
  const recentConcepts = [...concepts].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
          <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Your studio at a glance</h2>
          <p className="mt-1 text-sm text-muted">Manage Bridge’s two primary product lines from one workspace.</p>
        </div>
        <Link to="/account" className="text-sm font-semibold text-accent hover:underline">Account settings →</Link>
      </section>

      <section aria-label="Primary Production and DIT workspace" className="rounded-2xl border-2 border-accent/40 bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Primary Studio workspace</p>
            <h3 className="mt-1 font-display text-2xl font-semibold">Production &amp; DIT</h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">Start with camera-card ingest, source-manifest registration, SHA-256 verification and independent Primary / Recovery Vault checks.</p>
          </div>
          <Link to="/studio-dit" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-fg px-6 py-3 text-sm font-semibold text-bg">Open Production &amp; DIT →</Link>
        </div>
      </section>

      <section aria-label="Studio product overview" className="grid gap-3 sm:grid-cols-3">
        <Metric label="Finished Films" value={titlesQ.isPending || titlesQ.isError ? "—" : String(finishedFilms.length)} note="Completed-film product records" />
        <Metric label="Stories / Concepts" value={!STORY_CONCEPT_ENABLED || conceptsQ.isPending || conceptsQ.isError ? "—" : String(concepts.length)} note="Development-stage product records" />
        <Metric label="Film workflow actions" value={titlesQ.isPending || titlesQ.isError ? "—" : String(pendingFilms.length)} note="Upload, preparation, QC or rights" />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-semibold">Your Bridge products</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Product 01</p>
            <h3 className="mt-2 font-display text-xl font-semibold">Finished Films</h3>
            <p className="mt-2 text-sm text-muted">Completed films follow the production and rights lifecycle: assets → QC → rights → licensing → delivery → revenue.</p>
            <p className="mt-4 text-2xl font-semibold tabular-nums">{titlesQ.isPending || titlesQ.isError ? "—" : finishedFilms.length}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/submit-film" className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">Submit Finished Film</Link>
              <Link to="/workspace" className="self-center text-sm font-semibold text-accent hover:underline">Open product library →</Link>
            </div>
          </article>
          <article className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Product 02</p>
            <h3 className="mt-2 font-display text-xl font-semibold">Stories / Concepts</h3>
            <p className="mt-2 text-sm text-muted">Ideas, scripts and pitches follow a separate intake and curation pipeline before any buyer or investor introduction.</p>
            <p className="mt-4 text-2xl font-semibold tabular-nums">{!STORY_CONCEPT_ENABLED || conceptsQ.isPending || conceptsQ.isError ? "—" : concepts.length}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {STORY_CONCEPT_ENABLED ? <Link to="/submit-concept" className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">Submit Story / Concept</Link> : <span className="text-sm text-muted">Submission is not enabled in this environment.</span>}
              <Link to="/workspace" className="self-center text-sm font-semibold text-accent hover:underline">Open product library →</Link>
            </div>
          </article>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Finished Film pipeline</h3>
            <p className="text-sm text-muted">Canonical film records authorized for this Studio account.</p>
          </div>
          <Link to="/workspace" className="shrink-0 text-sm font-semibold text-accent hover:underline">View library →</Link>
        </div>
        {titlesQ.isPending ? <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">Loading Finished Films…</p> : null}
        {titlesQ.isError ? (
          <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
            <p>Finished Film records could not be loaded. Counts are unavailable until the data source responds.</p>
            <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 font-semibold text-accent underline">Retry</button>
          </div>
        ) : null}
        {!titlesQ.isPending && !titlesQ.isError ? (
          recentFilms.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentFilms.map((title) => <article key={title.id} className="flex min-h-36 flex-col justify-between rounded-xl border border-line bg-surface p-4">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Finished Film</p><Link to="/title/$id" params={{ id: title.id }} className="mt-2 block font-semibold hover:text-accent">{title.name}</Link><p className="mt-1 text-xs text-muted">{title.contentType} · {title.language}{title.year ? ` · ${title.year}` : ""}</p></div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3"><span className="text-xs text-muted">{title.status.replaceAll("_", " ")}</span><Link to="/title/$id" params={{ id: title.id }} className="text-sm font-semibold text-accent hover:underline">Open →</Link></div>
            </article>)}
          </div> : <p className="rounded-xl border border-dashed border-line p-7 text-center text-sm text-muted">No Finished Film records are available for this Studio account yet.</p>
        ) : null}
      </section>

      {STORY_CONCEPT_ENABLED ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold">Story / Concept pipeline</h3>
              <p className="text-sm text-muted">Separate curation status; no automatic publication to Loop.</p>
            </div>
            <Link to="/submit-concept" className="shrink-0 text-sm font-semibold text-accent hover:underline">New concept →</Link>
          </div>
          {conceptsQ.isPending ? <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">Loading Stories / Concepts…</p> : null}
          {conceptsQ.isError ? (
            <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
              <p>Story / Concept records could not be loaded. No zero count is assumed.</p>
              <button type="button" onClick={() => void conceptsQ.refetch()} className="mt-2 font-semibold text-accent underline">Retry</button>
            </div>
          ) : null}
          {!conceptsQ.isPending && !conceptsQ.isError ? (
            recentConcepts.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentConcepts.map((concept) => <article key={concept.id} className="flex min-h-36 flex-col justify-between rounded-xl border border-line bg-surface p-4">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Story / Concept</p><Link to="/title/$id" params={{ id: concept.title_id }} className="mt-2 block font-semibold hover:text-accent">{concept.titleName}</Link></div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3"><span className="text-xs text-muted">{CONCEPT_STATUS[concept.curation_status] ?? concept.curation_status}</span><Link to="/title/$id" params={{ id: concept.title_id }} className="text-sm font-semibold text-accent hover:underline">Open →</Link></div>
              </article>)}
            </div> : <p className="rounded-xl border border-dashed border-line p-7 text-center text-sm text-muted">No Story / Concept submissions yet. Submit a concept to start this pipeline.</p>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">
        <Link to="/account" className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
          <div><h3 className="font-semibold">Account & Members</h3><p className="mt-1 text-sm text-muted">View account profile and verified access</p></div>
          <span aria-hidden="true" className="text-lg text-muted">→</span>
        </Link>
      </section>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </article>
  );
}
