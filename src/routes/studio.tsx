import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";

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
            </section>

            <section className="space-y-4" aria-label="Studio products and services">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio products & services</p>
                <h3 className="mt-1 font-display text-xl font-semibold">Your production workspace</h3>
                <p className="mt-1 text-sm text-muted">Open each service in its own dedicated workspace.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Link to="/studio/service/$service" params={{ service: "dit" }} className="group rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent">
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">Available now</span><h4 className="mt-3 font-display text-xl font-semibold">Studio DIT Agent</h4><p className="mt-2 text-sm text-muted">Camera-card ingest, manifest matching, SHA-256 checks and Primary / Recovery verification.</p><span className="mt-5 inline-flex text-sm font-semibold">Open DIT workspace →</span>
                </Link>
                {[
                  ["productions", "Productions", "Project tracking, production milestones and handover."],
                  ["schedule", "Schedule", "A shared production calendar for teams and milestones."],
                  ["statements", "Statements", "Verified licensing statements and settlement reporting."],
                  ["insights", "Insights", "Verified portfolio, title readiness and performance analytics."],
                ].map(([service, name, description]) => (
                  <Link key={service} to="/studio/service/$service" params={{ service }} className="rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Coming soon</span><h4 className="mt-3 font-display text-xl font-semibold">{name}</h4><p className="mt-2 text-sm text-muted">{description}</p><span className="mt-5 inline-flex text-sm font-semibold">View service →</span>
                  </Link>
                ))}
                <Link to="/account" className="rounded-2xl border border-line bg-surface p-5 transition hover:border-accent"><span className="text-xs font-semibold uppercase tracking-wider text-muted">Profile</span><h4 className="mt-3 font-display text-xl font-semibold">Studio Account</h4><p className="mt-2 text-sm text-muted">Organization identity and verification details.</p><span className="mt-5 inline-flex text-sm font-semibold">Open account →</span></Link>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">New submission</h3>
                <p className="mt-1 text-sm text-muted">Choose a dedicated submission workflow. Every title remains subject to Bridge QC, Legal and Rights approvals.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link to="/submit-film" className="rounded-sm border border-line p-4 hover:border-accent">
                  <strong>New Finished Film</strong>
                  <p className="mt-1 text-sm text-muted">Submit a completed film for rights and buyer review</p>
                </Link>
                <Link to="/submit-concept" className="rounded-sm border border-line p-4 hover:border-accent">
                  <strong>Story / Concept</strong>
                  <p className="mt-1 text-sm text-muted">Submit a story or concept for separate curation</p>
                </Link>
              </div>
            </section>

            <section id="studio-titles" className="space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">Finished films</h3>
                <p className="mt-1 text-sm text-muted">Only titles authorized for this studio account should appear here.</p>
              </div>
              <TitleList empty="No finished films are currently returned for this studio account." />
              <MyStoryConcepts />
            </section>


            <section id="studio-members" className="space-y-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-xl font-semibold">Members & Roles</h3>
                  <span className="rounded-full border border-line px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Role management — Coming soon</span>
                </div>
                <p className="mt-1 text-sm text-muted">The verified member roster is read-only. Invitations, access changes and owner transfers are not enabled from this workspace.</p>
              </div>
              <StudioMemberDesk />
            </section>


          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}