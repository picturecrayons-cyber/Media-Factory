import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/workspace")({ component: Workspace });

const MODULES = [
  ["Titles", "One canonical title record from ingest to market."],
  ["Files & QC", "Private masters, artwork, audio, subtitles and technical review."],
  ["Rights", "Ownership, territories, languages, windows and approvals."],
  ["Licensing", "Buyer access, offers, negotiations and contracts."],
  ["Deliveries", "Authorized delivery to buyers and Crayons LOOP."],
  ["Revenue", "Verified payment, entitlement and settlement records."],
  ["Team", "Role-based access with server-enforced permissions."],
  ["Activity", "Audit and lifecycle events across the workspace."],
] as const;

function Workspace() {
  return (
    <RequireBridge>
      {(actor) => {
        const canCreate = hasPermission(actor, "title.create");
        return (
          <BridgeShell actor={actor} title={actor.organizationName ?? actor.displayName ?? "Workspace"}>
            <section className="rounded-3xl border border-line bg-surface p-6 md:p-8">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    {actor.internalRole ? actor.internalRole.replaceAll("_", " ") : actor.accountType.replaceAll("_", " ")}
                  </p>
                  <h2 className="mt-2 font-display text-3xl md:text-4xl">One workspace. Title at the centre.</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
                    Bridge keeps content preparation, rights, licensing, delivery and verified commercial records in one operational flow. Your role only exposes actions you are allowed to perform.
                  </p>
                </div>
                <Link to="/account" className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Account</Link>
              </div>
            </section>

            <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {MODULES.map(([name, description]) => (
                <article key={name} className="rounded-2xl border border-line bg-surface p-5">
                  <h3 className="font-display text-lg">{name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
                </article>
              ))}
            </section>

            {canCreate ? (
              <section className="mt-8 rounded-3xl border border-line bg-surface p-6 md:p-8">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Ingest</p>
                  <h2 className="mt-1 font-display text-2xl">Create title</h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted">
                    Uploading never publishes a title. Rights, QC and delivery authorization remain separate gates.
                  </p>
                </div>
                <CreateTitleForm />
              </section>
            ) : null}

            <section className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Titles</p>
              <h2 className="mt-1 font-display text-2xl">{actor.internalRole ? "Pipeline" : actor.accountType === "buyer" ? "Available Titles" : "My Titles"}</h2>
              <div className="mt-4">
                <TitleList empty="No titles available for this workspace." />
              </div>
            </section>
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}
