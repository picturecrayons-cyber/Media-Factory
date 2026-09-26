import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/creator")({ component: Creator });

const modules = [
  ["My Titles", "Create, prepare and track every title through the Bridge lifecycle."],
  ["Assets & QC", "Masters, artwork, audio, subtitles and documents stay private until approved."],
  ["Rights", "Ownership, territory, language and exploitation windows remain the source of truth."],
  ["Distribution", "Track buyer delivery and Bridge-authorized Crayons LOOP publication."],
  ["Revenue", "Licensing and distribution revenue appears only from verified transaction records."],
  ["Statements", "Settlement, invoice and statement history will live with the title record."],
  ["Updates", "QC, rights, licensing, payment and delivery events in one operational feed."],
  ["Team", "Invite collaborators with server-enforced role permissions."],
] as const;

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator workspace">
          <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Crayons Bridge</p>
                <h2 className="mt-2 font-display text-3xl md:text-4xl">Your content business, from master to market.</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
                  Upload once, prepare the title, clear rights, license to buyers, authorize distribution and follow verified revenue without exposing private masters.
                </p>
              </div>
              <Link to="/account" className="rounded-full border border-border px-4 py-2 text-sm font-semibold">Account & billing</Link>
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
            <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Submission</p>
                <h2 className="mt-1 font-display text-2xl">Create a title</h2>
              </div>
              <p className="max-w-xl text-sm text-muted">Each film is one durable title record. AWS assets remain private; buyer and LOOP visibility require explicit authorization.</p>
            </div>
            <CreateTitleForm />
          </section>

          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Portfolio</p>
                <h2 className="mt-1 font-display text-2xl">My Titles</h2>
              </div>
            </div>
            <TitleList empty="No titles yet. Create a draft to begin Upload → QC → Rights → Licensing → Delivery." />
          </section>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
