import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listDeliveryTraces } from "@/lib/bridge/deliveries";
import { listStudioOperations } from "@/lib/bridge/studio-operations";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import { CreatorDocumentVault } from "@/components/bridge/creator-document-vault";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio dashboard">
          <div className="mx-auto max-w-5xl space-y-8 px-1 pb-16">
            <section id="home" className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
                <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{actor.organizationName || actor.displayName}</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">Manage studio-owned titles and coordinate organization, production and DIT work. Member access and title visibility remain server-authorized.</p>
              </div>
              <Link to="/deliveries" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">View deliveries</Link>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Studio workspace navigation">
              <a href="#studio-titles" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Studio Titles</strong><p className="mt-1 text-sm text-muted">Finished films and story concepts</p></a>
              <a href="#studio-operations" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Production & QC</strong><p className="mt-1 text-sm text-muted">Production status, QC and legal review</p></a>
              <a href="#studio-deliveries" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Deliveries & Rights</strong><p className="mt-1 text-sm text-muted">Organization-scoped destination and delivery status</p></a>
              <Link to="/account" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Account</strong><p className="mt-1 text-sm text-muted">Studio account profile</p></Link>
              <a href="#studio-dit" className="rounded-sm border border-line p-4 hover:border-accent"><strong>DIT Agent</strong><p className="mt-1 text-sm text-muted">Camera-card manifest, checksum evidence and sign-off</p></a>
              <a href="#studio-documents" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Document Vault</strong><p className="mt-1 text-sm text-muted">Reusable private rights and ownership documents</p></a>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">Add a studio title</h3>
                <p className="mt-1 text-sm text-muted">Finished films and story concepts remain separate. A title upload does not bypass QC, rights or licensing approvals.</p>
              </div>
              <NewSubmissionPanel />
            </section>

            <section id="studio-titles" className="space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">Finished films</h3>
                <p className="mt-1 text-sm text-muted">Only titles authorized for this studio account should appear here.</p>
              </div>
              <TitleList empty="No finished films are currently returned for this studio account." />
              <MyStoryConcepts />
            </section>


            <section id="studio-operations" className="scroll-mt-20">
              <StudioOperationsPanel />
            </section>

            <section id="studio-documents" className="scroll-mt-20">
              <CreatorDocumentVault />
            </section>

            <section id="studio-members" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Members & Roles</h3>
                <p className="mt-1 text-sm text-muted">Read-only roster for verified Studio owners and administrators. Role changes and invitations remain disabled until separately approved.</p>
              </div>
              <StudioMemberDesk />
            </section>

            <section id="studio-dit" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Studio DIT Agent</h3>
                <p className="mt-1 text-sm text-muted">Register source-card manifests, compare Primary and Recovery manifest evidence, and record operator sign-off. Server actions are restricted to active Studio owner, admin, producer or DIT memberships.</p>
              </div>
              <DitAgentDesk actor={actor} />
            </section>

            <section id="studio-deliveries" className="scroll-mt-20">
              <StudioDeliveryDesk userId={actor.userId} organizationId={actor.organizationId ?? null} />
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}


function StudioDeliveryDesk({ userId, organizationId }: { userId: string; organizationId: string | null }) {
  const query = useQuery({
    queryKey: ["bridge-studio-delivery-traces", userId, organizationId],
    queryFn: () => listDeliveryTraces(),
    retry: 1,
  });
  const rows = query.data?.deliveries ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Organization-scoped operations</p>
        <h3 className="mt-1 font-display text-xl font-semibold">Deliveries & rights coverage</h3>
        <p className="mt-1 text-sm text-muted">Destination packages are visible only for titles owned by you or your active Studio organization. Settlement status is shown only where the existing finance permission permits it.</p>
      </div>
      {query.isPending ? <p role="status" className="text-sm text-muted">Loading organization delivery records…</p> : null}
      {query.isError ? (
        <div role="alert" className="rounded-xl border border-line p-4 text-sm">
          <p>Delivery records are unavailable. No fallback or zero totals are assumed.</p>
          <button type="button" className="mt-2 font-semibold text-accent underline" onClick={() => void query.refetch()}>Retry</button>
        </div>
      ) : null}
      {query.isSuccess && !rows.length ? <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">No delivery or destination records are available in this Studio scope.</p> : null}
      {query.isSuccess ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.titleId} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to="/title/$id" params={{ id: row.titleId }} className="font-semibold hover:text-accent">{row.titleName}</Link>
                  <p className="mt-1 text-xs text-muted">{row.language}{row.year ? ` · ${row.year}` : ""} · {row.investorCount} recorded investor{row.investorCount === 1 ? "" : "s"}</p>
                </div>
                {row.settlementStatus ? <span className="rounded-full border border-line px-3 py-1 text-xs">{row.settlementStatus}</span> : null}
              </div>
              {row.destinations.length ? (
                <ul className="mt-4 divide-y divide-line border-t border-line">
                  {row.destinations.map((destination) => (
                    <li key={destination.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <div>
                        <p className="font-medium">{destination.buyer}</p>
                        <p className="mt-1 text-xs text-muted">{destination.commercialModel} · {destination.distributorExclusivity}</p>
                      </div>
                      <span className="text-xs text-muted">{destination.state}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-3 border-t border-line pt-3 text-xs text-muted">No destination packages recorded.</p>}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}


function StudioOperationsPanel() {
  const query = useQuery({
    queryKey: ["bridge-studio-operations"],
    queryFn: () => listStudioOperations(),
    retry: 0,
  });
  const data = query.data;
  const money = (minor: number | null, currency: string) =>
    minor == null ? "Not reported" : new Intl.NumberFormat("en-IN", {
      style: "currency", currency, maximumFractionDigits: 2,
    }).format(minor / 100);
  const date = (value: string) => new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Studio operations</p>
        <h3 className="mt-1 font-display text-xl font-semibold">Production, QC & schedule</h3>
        <p className="mt-1 text-sm text-muted">Records are restricted to the active Studio organization. Review states do not grant publication approval.</p>
      </div>
      {query.isPending ? <p role="status" className="text-sm text-muted">Loading Studio operations…</p> : null}
      {query.isError ? (
        <div role="alert" className="rounded-xl border border-line p-4 text-sm">
          <p>Studio operations could not be loaded. Existing title and delivery pages remain available.</p>
          <button type="button" className="mt-2 font-semibold text-accent underline" onClick={() => void query.refetch()}>Retry</button>
        </div>
      ) : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-line p-4">
              <p className="text-xs text-muted">Finished films</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{data.productions.length}</p>
            </article>
            <article className="rounded-xl border border-line p-4">
              <p className="text-xs text-muted">QC passed</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{data.productions.filter((row) => row.qcStatus === "PASSED").length}</p>
            </article>
            <article className="rounded-xl border border-line p-4">
              <p className="text-xs text-muted">Upcoming / recorded schedule events</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{data.capabilities.schedule ? data.schedule.length : "—"}</p>
            </article>
          </div>

          <section className="space-y-3">
            <h4 className="font-semibold">Production tracker</h4>
            {!data.productions.length ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No finished-film production records are available in this Studio scope.</p> : null}
            {data.productions.map((row) => (
              <article key={row.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link to="/title/$id" params={{ id: row.id }} className="font-semibold hover:text-accent">{row.name}</Link>
                    <p className="mt-1 text-xs text-muted">{row.language}{row.year ? ` · ${row.year}` : ""} · Updated {new Date(row.updatedAt).toLocaleDateString("en-IN")}</p>
                  </div>
                  <span className="text-xs text-muted">{row.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <p>QC: <strong>{row.qcStatus}</strong></p>
                  <p>Legal: <strong>{row.legalStatus}</strong></p>
                  <p>OTT: <strong>{row.ottStatus}</strong></p>
                  <p>Packaging: <strong>{row.packagingStatus}</strong></p>
                  <p>Curation: <strong>{row.curationStatus}</strong></p>
                  <p>Delivery: <strong>{row.deliveryStatus}</strong></p>
                </div>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <h4 className="font-semibold">Production schedule</h4>
            {!data.capabilities.schedule ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Schedule storage is not present in this environment's canonical schema. No sample events are displayed.</p>
            ) : !data.schedule.length ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No schedule events are recorded for this Studio organization.</p>
            ) : data.schedule.map((event) => (
              <article key={event.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-4">
                <div>
                  <p className="font-medium">{event.eventName}</p>
                  <p className="mt-1 text-xs text-muted">{event.titleName} · {event.eventType}{event.location ? ` · ${event.location}` : ""}</p>
                  <p className="mt-1 text-xs text-muted">{date(event.startsAt)} – {date(event.endsAt)}</p>
                </div>
                <span className="text-xs text-muted">{event.status}</span>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <h4 className="font-semibold">Statements</h4>
            {!data.capabilities.statements ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Channel statement records are not present in this environment's canonical schema. No financial totals are inferred.</p>
            ) : !data.statements.length ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No channel statements are recorded for this Studio scope.</p>
            ) : data.statements.map((statement) => (
              <article key={statement.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{statement.titleName} · {statement.channelName}</p>
                    <p className="mt-1 text-xs text-muted">{statement.periodStart} – {statement.periodEnd}{statement.statementReference ? ` · ${statement.statementReference}` : ""}</p>
                  </div>
                  <span className="text-xs text-muted">{statement.statementStatus}</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <p>Reported gross: <strong>{money(statement.reportedGrossMinor, statement.currency)}</strong></p>
                  <p>Adjustments: <strong>{money(statement.adjustmentsMinor, statement.currency)}</strong></p>
                  <p>Net: <strong>{money(statement.netAmountMinor, statement.currency)}</strong></p>
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
