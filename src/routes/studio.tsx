import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listTitles } from "@/lib/bridge/titles";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

export const Route = createFileRoute("/studio")({ component: Studio });

function MetricCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  href?: "/workspace" | "/deliveries";
}) {
  const content = (
    <div className="h-full rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
    </div>
  );

  return href ? <Link to={href} className="block h-full">{content}</Link> : content;
}

function Studio() {
  const titlesQuery = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
  });
  const conceptsQuery = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
  });

  return (
    <RequireBridge allow="studio">
      {(actor) => {
        const allTitles = titlesQuery.data?.titles ?? [];
        // Story-concept records are stored as OTHER and must never appear in Finished Films.
        const films = allTitles.filter((title) => title.contentType.trim().toLowerCase() === "film");
        const qcPending = films.filter((title) => title.status === "QC_REVIEW").length;
        const uploadsInProgress = films.filter((title) => title.status === "UPLOADING").length;
        const conceptCount = conceptsQuery.data?.concepts.length;

        return (
          <BridgeShell actor={actor} title="Studio Dashboard">
            <div className="space-y-8 pb-12">
              <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
                  <h2 className="mt-2 font-display text-xl font-semibold sm:text-2xl">Your production business, at a glance.</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Track film submissions, production progress and story pitches. Open a title to manage its metadata, assets, QC and delivery.
                  </p>
                </div>
                <div className="w-full shrink-0 sm:w-auto">
                  <NewSubmissionPanel />
                </div>
              </section>

              <section aria-label="Studio overview">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-semibold">Business overview</h2>
                  {titlesQuery.isError ? (
                    <button type="button" onClick={() => void titlesQuery.refetch()} className="text-xs font-semibold text-accent underline underline-offset-4">Retry data</button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Film titles"
                    value={titlesQuery.isPending ? "—" : titlesQuery.isError ? "!" : String(films.length)}
                    detail="Your studio's finished-film records"
                    href="/workspace"
                  />
                  <MetricCard
                    label="QC pending"
                    value={titlesQuery.isPending ? "—" : titlesQuery.isError ? "!" : String(qcPending)}
                    detail={uploadsInProgress ? `${uploadsInProgress} upload(s) in progress` : "Titles awaiting QC review"}
                    href="/workspace"
                  />
                  <MetricCard
                    label="Story pitches"
                    value={!STORY_CONCEPT_ENABLED ? "Off" : conceptsQuery.isPending ? "—" : conceptsQuery.isError ? "!" : String(conceptCount ?? 0)}
                    detail={STORY_CONCEPT_ENABLED ? "Your submitted concepts" : "Story / Concept submissions are not enabled"}
                  />
                  <MetricCard
                    label="Actual revenue"
                    value="Not verified"
                    detail="Available after financial records are connected and reconciled"
                  />
                </div>
              </section>

              <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
                <div className="min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold">My Productions</h2>
                      <p className="mt-1 text-xs text-muted">Film records only · story concepts are listed separately</p>
                    </div>
                    <Link to="/workspace" className="text-sm font-semibold text-accent underline-offset-4 hover:underline">Open film library →</Link>
                  </div>
                  {titlesQuery.isError ? (
                    <div role="alert" className="rounded-xl border border-line p-4 text-sm text-muted">
                      Could not load your film records. Use Retry data above.
                    </div>
                  ) : (
                    <TitleList
                      empty="No finished-film records yet. Use New submission to add a film."
                      contentType="Film"
                    />
                  )}
                </div>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="font-display text-lg font-semibold">Production attention</h2>
                    <p className="mt-1 text-xs text-muted">Current workflow states from your title records</p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                        <span className="text-muted">Uploads in progress</span>
                        <strong className="tabular-nums">{titlesQuery.isPending ? "—" : uploadsInProgress}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                        <span className="text-muted">QC review</span>
                        <strong className="tabular-nums">{titlesQuery.isPending ? "—" : qcPending}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">Data status</span>
                        <strong className="text-xs">{titlesQuery.isError ? "Unavailable" : titlesQuery.isPending ? "Loading" : "Live query"}</strong>
                      </div>
                    </div>
                    <Link to="/workspace" className="mt-4 inline-flex text-sm font-semibold text-accent underline-offset-4 hover:underline">Review title records →</Link>
                  </div>

                  <div className="rounded-2xl border border-line bg-elevated/50 p-5">
                    <h2 className="font-display text-base font-semibold">Revenue reporting</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      Revenue, revenue share and settlements will appear only when backed by reconciled transaction and settlement records. No estimates are shown here.
                    </p>
                  </div>
                </aside>
              </section>

              {STORY_CONCEPT_ENABLED ? (
                <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold">Story Concepts</h2>
                      <p className="mt-1 text-xs text-muted">Separate review pipeline · never mixed into finished films</p>
                    </div>
                  </div>
                  <MyStoryConcepts />
                </section>
              ) : null}
            </div>
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}
