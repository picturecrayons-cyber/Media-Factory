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
import { listDeliveryTraces } from "@/lib/bridge/deliveries";

export const Route = createFileRoute("/creator")({ component: Creator });

const CREATOR_TABS = [
  "Overview",
  "Submissions",
  "Finished Films",
  "Story Concepts",
  "Review & Revisions",
  "Files & DIT",
  "Rights & Licensing",
  "Distribution",
  "Earnings & Payouts",
  "Analytics",
  "Account",
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

function CreatorWorkspace() {
  const [activeTab, setActiveTab] = useState<CreatorTab>("Overview");
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
    enabled: activeTab === "Distribution" || activeTab === "Earnings & Payouts",
    retry: false,
  });

  const titles = titlesQ.data?.titles ?? [];
  const concepts = conceptsQ.data?.concepts ?? [];
  const conceptIds = concepts.map((concept) => concept.title_id);
  const conceptIdSet = new Set(conceptIds);
  const finishedFilms = titles.filter((title) => !conceptIdSet.has(title.id));
  const inReview = finishedFilms.filter((title) => ["QC_REVIEW", "RIGHTS_REVIEW"].includes(title.status));
  const activeDeals = finishedFilms.filter((title) => ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status));
  const classificationReady = !STORY_CONCEPT_ENABLED || conceptsQ.isSuccess;

  function titleRows(filter: (status: string) => boolean, empty: string) {
    const matches = finishedFilms.filter((title) => filter(title.status));
    if (titlesQ.isPending) return <p className="text-sm text-muted">Loading your titles…</p>;
    if (titlesQ.isError) return <p role="alert" className="text-sm text-muted">Your title records are unavailable. Retry from the Finished Films tab.</p>;
    if (!matches.length) return <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{empty}</p>;
    return (
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {matches.map((title) => (
          <li key={title.id}>
            <Link to="/title/$id" params={{ id: title.id }} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-fg/5 sm:px-5">
              <span className="min-w-0">
                <span className="block truncate font-medium">{title.name}</span>
                <span className="mt-1 block text-xs text-muted">{title.language}{title.year ? ` · ${title.year}` : ""}</span>
              </span>
              <span className="rounded-full border border-line px-3 py-1 text-[11px] font-semibold">{title.status.replaceAll("_", " ")}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Private Creator workspace</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your films. Your submissions. Your business.</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Track your own submissions, review progress, authorized distribution and verified settlement status. Bridge teams retain QC, Legal, licensing approval and payout authorization.</p>
        </div>
        {activeTab === "Overview" ? <NewSubmissionPanel /> : null}
      </section>

      <nav aria-label="Creator dashboard tabs" className="flex gap-1 overflow-x-auto border-b border-line pb-1">
        {CREATOR_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            aria-current={activeTab === tab ? "page" : undefined}
            aria-pressed={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 rounded-t-lg border-b-2 px-3 py-3 text-sm font-medium transition ${activeTab === tab ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Overview" ? (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Creator summary">
            {[
              ["Finished films", titlesQ.isError || titlesQ.isPending ? "—" : finishedFilms.length],
              ["Story concepts", conceptsQ.isError || (STORY_CONCEPT_ENABLED && conceptsQ.isPending) ? "—" : concepts.length],
              ["In review", titlesQ.isError || titlesQ.isPending ? "—" : inReview.length],
              ["Licensed / delivered", titlesQ.isError || titlesQ.isPending ? "—" : activeDeals.length],
            ].map(([label, value]) => (
              <article key={label} className="rounded-xl border border-line bg-surface p-4">
                <p className="text-xs font-medium text-muted">{label}</p>
                <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
                <p className="mt-1 text-[11px] text-muted">Based on currently returned account records</p>
              </article>
            ))}
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-line p-5">
              <h3 className="font-semibold">Submission pipeline</h3>
              <p className="mt-2 text-sm text-muted">Create finished-film records or submit a separate story concept. Both remain private until the authorized Bridge workflow clears them.</p>
              <button type="button" onClick={() => setActiveTab("Submissions")} className="mt-4 text-sm font-semibold text-accent">Open submissions →</button>
            </article>
            <article className="rounded-xl border border-line p-5">
              <h3 className="font-semibold">Revenue & trust</h3>
              <p className="mt-2 text-sm text-muted">Only captured payment evidence and finance-recorded settlement status may be shown. Estimates and unverified payouts are never presented as paid earnings.</p>
              <button type="button" onClick={() => setActiveTab("Earnings & Payouts")} className="mt-4 text-sm font-semibold text-accent">Open earnings →</button>
            </article>
          </section>
        </div>
      ) : null}

      {activeTab === "Submissions" ? (
        <section className="space-y-3">
          <h3 className="font-display text-xl font-semibold">Start a submission</h3>
          <p className="text-sm text-muted">Finished Film and Story / Concept are separate submission types and review paths.</p>
          <NewSubmissionPanel />
        </section>
      ) : null}

      {activeTab === "Finished Films" ? (
        <section className="space-y-3">
          <div>
            <h3 className="font-display text-xl font-semibold">Finished-film submissions</h3>
            <p className="mt-1 text-sm text-muted">Only records returned by the authenticated Creator-owned title query are listed.</p>
          </div>
          {classificationReady ? <TitleList empty="No finished-film submissions yet." excludeIds={conceptIds} /> : conceptsQ.isError ? (
            <p role="alert" className="rounded-xl border border-line p-4 text-sm text-muted">Story-concept classification could not be verified. This list is paused to prevent concepts appearing as finished films.</p>
          ) : <p className="text-sm text-muted">Verifying submission categories…</p>}
        </section>
      ) : null}

      {activeTab === "Story Concepts" ? (
        <section className="space-y-3">
          <h3 className="font-display text-xl font-semibold">Story / Concept submissions</h3>
          <p className="text-sm text-muted">Concept submissions are reviewed separately and are not automatically published or licensed.</p>
          {!STORY_CONCEPT_ENABLED ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Story / Concept submission is not enabled in this environment.</p> : conceptsQ.isError ? <p role="alert" className="text-sm text-muted">Concept records are unavailable. Retry later; no records are assumed.</p> : <MyStoryConcepts />}
        </section>
      ) : null}

      {activeTab === "Review & Revisions" ? (
        <section className="space-y-3">
          <h3 className="font-display text-xl font-semibold">Review & revisions</h3>
          <p className="text-sm text-muted">Track review-stage status and open the title workspace to read available feedback or respond with updated materials. Creator accounts cannot approve QC or Legal decisions.</p>
          {titleRows((status) => ["PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(status), "No titles are currently in the review stages shown here.")}
        </section>
      ) : null}

      {activeTab === "Files & DIT" ? (
        <section className="space-y-3">
          <h3 className="font-display text-xl font-semibold">Files & production handoff</h3>
          <p className="text-sm text-muted">Open a title to upload or review its authorized assets. DIT booking, ingest verification and sign-off remain controlled by the authorized operations team; this tab does not create a false sign-off.</p>
          {titleRows(() => true, "Create a finished-film submission to open its file workspace.")}
        </section>
      ) : null}

      {activeTab === "Rights & Licensing" ? (
        <section className="space-y-3">
          <h3 className="font-display text-xl font-semibold">Rights & licensing status</h3>
          <p className="text-sm text-muted">View each title’s current Bridge stage in its workspace. Creators may provide rights evidence and commercial draft details where enabled; Legal/Admin alone approve rights and licensing.</p>
          {titleRows(() => true, "No title records are available.")}
        </section>
      ) : null}

      {activeTab === "Distribution" ? (
        <section className="space-y-3">
          <h3 className="font-display text-xl font-semibold">Authorized distribution</h3>
          <p className="text-sm text-muted">Buyer/platform destinations appear only when returned by the Creator-scoped delivery read model. Bridge authorization remains mandatory before Loop or external delivery.</p>
          {deliveriesQ.isPending ? <p className="text-sm text-muted">Loading authorized delivery records…</p> : deliveriesQ.isError ? <p role="alert" className="rounded-xl border border-line p-4 text-sm text-muted">Distribution records are not available for this account or environment. No destinations are inferred.</p> : deliveriesQ.data?.deliveries.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {deliveriesQ.data.deliveries.map((delivery) => (
                <li key={delivery.titleId} className="space-y-2 p-4">
                  <Link to="/title/$id" params={{ id: delivery.titleId }} className="font-semibold text-accent hover:underline">{delivery.titleName}</Link>
                  {delivery.destinations.length ? delivery.destinations.map((destination) => (
                    <div key={destination.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{destination.buyer}</span>
                      <span className="text-muted">{destination.state.replaceAll("_", " ")}</span>
                    </div>
                  )) : <p className="text-sm text-muted">No authorized destination record.</p>}
                </li>
              ))}
            </ul>
          ) : <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No authorized distribution records are available.</p>}
        </section>
      ) : null}

      {activeTab === "Earnings & Payouts" ? (
        <section className="space-y-3">
          <h3 className="font-display text-xl font-semibold">Earnings & payouts</h3>
          <p className="text-sm text-muted">The current Creator view can show finance settlement status where verified records are available. It does not calculate contractual payable amounts, initiate transfers or mark a payout paid without finance confirmation.</p>
          {deliveriesQ.isPending ? <p className="text-sm text-muted">Loading settlement status…</p> : deliveriesQ.isError ? <p role="alert" className="text-sm text-muted">Settlement status is unavailable. No payout amount is assumed.</p> : deliveriesQ.data?.deliveries.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {deliveriesQ.data.deliveries.map((delivery) => (
                <li key={delivery.titleId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <Link to="/title/$id" params={{ id: delivery.titleId }} className="font-medium text-accent hover:underline">{delivery.titleName}</Link>
                  <span className="text-sm text-muted">Settlement: {delivery.settlementStatus ?? "Not reported"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No settlement records are available.</p>}
          <p className="text-xs text-muted">Detailed payable calculations, statements and payout history require a dedicated Creator-scoped finance ledger and reconciliation gate before they can be certified.</p>
        </section>
      ) : null}

      {activeTab === "Analytics" ? (
        <section className="space-y-4">
          <div>
            <h3 className="font-display text-xl font-semibold">Creator analytics</h3>
            <p className="mt-1 text-sm text-muted">Counts below are calculated from the currently returned account-scoped title records (maximum 200), not from the entire Bridge catalogue.</p>
          </div>
          {titlesQ.isPending ? <p className="text-sm text-muted">Loading analytics…</p> : titlesQ.isError ? <p role="alert" className="text-sm text-muted">Analytics unavailable; no zero values are substituted.</p> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {["DRAFT", "UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].map((status) => (
                <article key={status} className="rounded-xl border border-line bg-surface p-4">
                  <p className="text-xs text-muted">{status.replaceAll("_", " ")}</p>
                  <p className="mt-2 font-display text-2xl font-semibold">{finishedFilms.filter((title) => title.status === status).length}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "Account" ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h3 className="font-display text-xl font-semibold">Account & access</h3>
          <p className="mt-2 text-sm text-muted">Manage profile and verification. Your account role does not grant QC, Legal, Finance, licensing approval or administrative access.</p>
          <Link to="/account" className="mt-4 inline-block text-sm font-semibold text-accent hover:underline">Open account settings →</Link>
        </section>
      ) : null}
    </div>
  );
}
