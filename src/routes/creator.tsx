import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listMyStoryConcepts } from "@/lib/bridge/story-concept-api";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";
import { listTitles } from "@/lib/bridge/titles";
import { listDeliveryTraces, type DeliveryTrace } from "@/lib/bridge/deliveries";

export const Route = createFileRoute("/creator")({ component: Creator });

const CREATOR_TABS = [
  "Overview",
  "Finished Films",
  "Story Concepts",
  "Files & Review",
  "Rights",
  "Distribution",
  "Earnings",
  "Payouts",
  "Reports",
] as const;
type CreatorTab = (typeof CREATOR_TABS)[number];

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator workspace">
          <CreatorWorkspace />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </article>
  );
}

function CreatorWorkspace() {
  const [tab, setTab] = useState<CreatorTab>("Overview");
  const titlesQ = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
    retry: false,
  });
  const conceptsQ = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    enabled: STORY_CONCEPT_ENABLED,
    retry: false,
  });
  const deliveriesQ = useQuery({
    queryKey: ["creator-delivery-traces"],
    queryFn: () => listDeliveryTraces(),
    retry: false,
  });

  const titles = titlesQ.data?.titles ?? [];
  const concepts = conceptsQ.data?.concepts ?? [];
  const conceptIds = concepts.map((concept) => concept.title_id);
  const deliveries = deliveriesQ.data?.deliveries ?? [];
  const finishedFilms = titles.filter((title) => !conceptIds.includes(title.id));
  const classificationReady = !STORY_CONCEPT_ENABLED || conceptsQ.isSuccess;
  const verifiedCount = (value: number | undefined, loading: boolean, failed: boolean) =>
    loading || failed || value === undefined ? "—" : String(value);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Private creator workspace</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your films. Your rights. Your earnings.</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Track submissions, review progress, authorized distribution and verified financial records. Bridge teams retain QC, Legal, licensing and payout approval authority.
          </p>
        </div>
        <div className="shrink-0"><NewSubmissionPanel /></div>
      </section>

      <nav aria-label="Creator dashboard tabs" className="flex gap-1 overflow-x-auto border-b border-line pb-1">
        {CREATOR_TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={`shrink-0 rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition ${tab === item ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            {item}
          </button>
        ))}
        <Link to="/account" className="ml-auto shrink-0 self-center px-3 py-2 text-sm text-muted hover:text-fg">Account ↗</Link>
      </nav>

      <div role="tabpanel" aria-label={tab} className="min-h-72 space-y-5">
        {tab === "Overview" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Finished films" value={verifiedCount(finishedFilms.length, titlesQ.isPending || conceptsQ.isPending, titlesQ.isError || conceptsQ.isError)} note="Your own title records" />
              <Metric label="Story concepts" value={verifiedCount(concepts.length, conceptsQ.isPending, conceptsQ.isError)} note="Separate curation workflow" />
              <Metric label="Distribution records" value={verifiedCount(deliveries.length, deliveriesQ.isPending, deliveriesQ.isError)} note="Your title records only" />
              <Metric label="Verified earnings" value="—" note="Financial ledger connection required" />
            </div>
            <section className="grid gap-3 md:grid-cols-2">
              <article className="rounded-xl border border-line p-5">
                <h3 className="font-semibold">Submission progress</h3>
                <p className="mt-1 text-sm text-muted">Open a film to review its current Bridge status, files and any available workflow feedback.</p>
                <button type="button" onClick={() => setTab("Finished Films")} className="mt-4 text-sm font-semibold text-accent hover:underline">View finished films →</button>
              </article>
              <article className="rounded-xl border border-line p-5">
                <h3 className="font-semibold">Distribution & finance</h3>
                <p className="mt-1 text-sm text-muted">Only authorized delivery records and reconciled financial statements should appear here.</p>
                <button type="button" onClick={() => setTab("Distribution")} className="mt-4 text-sm font-semibold text-accent hover:underline">View distribution →</button>
              </article>
            </section>
            {titlesQ.isError ? <p role="alert" className="text-sm text-muted">Title summary is unavailable. Retry from Finished Films.</p> : null}
          </>
        ) : null}

        {tab === "Finished Films" ? (
          <section className="space-y-3">
            <div>
              <h3 className="font-display text-xl font-semibold">Finished-film submissions</h3>
              <p className="mt-1 text-sm text-muted">Create, update and track your own finished-film records. QC and Legal decisions remain with authorized Bridge reviewers.</p>
            </div>
            {!classificationReady ? (
              <p role="alert" className="rounded-xl border border-line p-4 text-sm text-muted">
                Story-concept classification could not be verified. Finished-film records are paused to prevent concepts being shown as films.
              </p>
            ) : (
              <TitleList empty="No finished-film submissions yet. Start with New submission." excludeIds={conceptIds} />
            )}
          </section>
        ) : null}

        {tab === "Story Concepts" ? (
          <section className="space-y-3">
            <div>
              <h3 className="font-display text-xl font-semibold">Story / Concept submissions</h3>
              <p className="mt-1 text-sm text-muted">A separate curation workflow. A concept is not a finished film and is never published to Loop automatically.</p>
            </div>
            {!STORY_CONCEPT_ENABLED ? (
              <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">Story / Concept submissions are not enabled in this environment.</p>
            ) : conceptsQ.isError ? (
              <p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">Concept records could not be verified. No fallback or sample records are shown.</p>
            ) : (
              <MyStoryConcepts />
            )}
          </section>
        ) : null}

        {tab === "Files & Review" ? (
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold">Files, QC feedback & revisions</h3>
            <p className="text-sm text-muted">Open a title to manage permitted uploads and view its available workflow status. Uploads are limited to your own titles and eligible preparation stages.</p>
            <TitleList empty="No title records available." excludeIds={conceptIds} />
            <p className="rounded-xl border border-line p-4 text-xs text-muted">Creator accounts cannot sign off QC, legal clearance, rights verification, licensing or delivery. Those actions remain restricted to their designated Bridge roles.</p>
          </section>
        ) : null}

        {tab === "Rights" ? (
          <RightsPanel deliveries={deliveries} loading={deliveriesQ.isPending} failed={deliveriesQ.isError} />
        ) : null}

        {tab === "Distribution" ? (
          <DistributionPanel deliveries={deliveries} loading={deliveriesQ.isPending} failed={deliveriesQ.isError} />
        ) : null}

        {tab === "Earnings" || tab === "Payouts" ? (
          <FinancePanel mode={tab} deliveries={deliveries} loading={deliveriesQ.isPending} failed={deliveriesQ.isError} />
        ) : null}

        {tab === "Reports" ? (
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold">Creator reports</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Submission report" value={verifiedCount(titles.length, titlesQ.isPending, titlesQ.isError)} note="Title records returned by Bridge" />
              <Metric label="Distribution report" value={verifiedCount(deliveries.length, deliveriesQ.isPending, deliveriesQ.isError)} note="Delivery trace records" />
            </div>
            <p className="rounded-xl border border-line p-4 text-sm text-muted">Revenue exports, downloadable statements and period reconciliation are not enabled until the verified creator finance ledger is connected. No estimated or sample figures are displayed.</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function RightsPanel({ deliveries, loading, failed }: { deliveries: DeliveryTrace[]; loading: boolean; failed: boolean }) {
  if (loading) return <p className="text-sm text-muted">Loading rights records…</p>;
  if (failed) return <p role="alert" className="text-sm text-muted">Rights records are unavailable. No cached or sample terms are shown.</p>;
  const entries = deliveries.flatMap((delivery) => delivery.destinations.map((destination) => ({ delivery, destination })));
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-xl font-semibold">Rights & licensing</h3>
        <p className="mt-1 text-sm text-muted">Read-only view of rights and destination terms returned for your titles. This is not a licensing approval screen.</p>
      </div>
      {!entries.length ? <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">No destination rights records are available for your titles.</p> : entries.map(({ delivery, destination }) => (
        <article key={destination.id} className="rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h4 className="font-semibold">{delivery.titleName}</h4><p className="text-sm text-muted">{destination.buyer}</p></div>
            <span className="rounded-full border border-line px-2.5 py-1 text-xs">{destination.state}</span>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Territories</dt><dd>{displayValue(destination.territories)}</dd></div>
            <div><dt className="text-xs text-muted">Languages</dt><dd>{displayValue(destination.languages)}</dd></div>
            <div><dt className="text-xs text-muted">Media</dt><dd>{displayValue(destination.media)}</dd></div>
            <div><dt className="text-xs text-muted">Rights window</dt><dd>{destination.windowStart ?? "—"} – {destination.windowEnd ?? "—"}</dd></div>
          </dl>
        </article>
      ))}
    </section>
  );
}

function DistributionPanel({ deliveries, loading, failed }: { deliveries: DeliveryTrace[]; loading: boolean; failed: boolean }) {
  if (loading) return <p className="text-sm text-muted">Loading distribution records…</p>;
  if (failed) return <p role="alert" className="text-sm text-muted">Distribution records are unavailable. Retry later.</p>;
  return (
    <section className="space-y-3">
      <h3 className="font-display text-xl font-semibold">Distribution & deliveries</h3>
      <p className="text-sm text-muted">Track destination readiness and delivery records. Bridge authorization is required before any downstream publication or buyer delivery.</p>
      {!deliveries.length ? <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">No distribution records are available for your titles.</p> : deliveries.map((delivery) => (
        <article key={delivery.titleId} className="rounded-xl border border-line bg-surface p-4">
          <h4 className="font-semibold">{delivery.titleName}</h4>
          {delivery.destinations.length ? (
            <ul className="mt-3 divide-y divide-line">
              {delivery.destinations.map((destination) => (
                <li key={destination.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>{destination.buyer}</span><span className="text-muted">{destination.state}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted">No destination package recorded.</p>}
        </article>
      ))}
    </section>
  );
}

function FinancePanel({ mode, deliveries, loading, failed }: { mode: "Earnings" | "Payouts"; deliveries: DeliveryTrace[]; loading: boolean; failed: boolean }) {
  const settlementStatuses = [...new Set(deliveries.map((delivery) => delivery.settlementStatus).filter(Boolean))];
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-xl font-semibold">{mode === "Earnings" ? "Creator earnings" : "Creator payouts"}</h3>
        <p className="mt-1 text-sm text-muted">Private financial information is limited to your own title records.</p>
      </div>
      {loading ? <p className="text-sm text-muted">Checking available settlement records…</p> : failed ? (
        <p role="alert" className="rounded-xl border border-line p-4 text-sm text-muted">Settlement status could not be verified.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Settlement status records" value={String(settlementStatuses.length)} note="Status categories only; not payment amounts" />
          <Metric label={mode === "Earnings" ? "Verified creator earnings" : "Confirmed payouts"} value="—" note="No creator-level reconciled amount ledger is connected" />
        </div>
      )}
      <p className="rounded-xl border border-line p-4 text-sm text-muted">
        {mode === "Earnings"
          ? "Only reconciled revenue, approved contract shares, refunds, fees and taxes can be shown as earnings. Current delivery traces expose settlement status only, not verified payable amounts."
          : "Payouts are not initiated from this dashboard. A payable must be reconciled against the agreement, verified by Finance, separately approved and confirmed as paid before it appears as completed."}
      </p>
    </section>
  );
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  if (value == null || value === "") return "—";
  return String(value);
}
