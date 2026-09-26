import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

const modules = [
  ["Slate", "All studio titles with lifecycle, readiness and delivery state."],
  ["Assets & QC", "Master, audio, subtitles, artwork and document validation."],
  ["Rights & Legal", "Ownership, territories, languages, windows, documents and approvals."],
  ["Licensing", "Buyer access, offers, negotiations, contracts and delivery authorization."],
  ["Distribution", "Buyer deliveries and explicit Bridge → LOOP publication controls."],
  ["Revenue", "Verified licensing, payment and distribution revenue by title."],
  ["Statements", "Settlement, invoice and reconciliation records for finance teams."],
  ["Team", "Owner, manager, producer, QC, legal, licensing, finance and viewer access."],
] as const;

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title={actor.organizationName ?? "Studio workspace"}>
          <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Studio operations</p>
                <h2 className="mt-2 font-display text-3xl md:text-4xl">One slate. One rights record. One route to market.</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
                  Manage title preparation, rights, buyer licensing, secure delivery, distribution authorization and verified commercial records without creating a second content system.
                </p>
              </div>
              <Link to="/account" className="rounded-full border border-border px-4 py-2 text-sm font-semibold">Studio account</Link>
            </div>
          </section>

          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map(([name, description]) => (
              <article key={name} className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-display text-lg">{name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
              </article>
            ))}
          </section>

          <section className="mt-8 rounded-3xl border border-border bg-card p-6 md:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ingest</p>
              <h2 className="mt-1 font-display text-2xl">Add title to slate</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted">The studio uses the same canonical title and lifecycle as independent creators. Private AWS assets are never made public by upload alone.</p>
            </div>
            <CreateTitleForm />
          </section>

          <section className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Portfolio</p>
            <h2 className="mt-1 font-display text-2xl">Studio Slate</h2>
            <div className="mt-4">
              <TitleList empty="No titles on this slate yet. Add the first title to begin the supply chain." />
            </div>
          </section>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
