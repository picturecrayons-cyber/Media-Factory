import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

const comingSoonModules = [
  ["Productions", "Project-level production tracking and milestone management."],
  ["Schedule", "Shared production and delivery calendar."],
  ["Statements", "Studio licensing statements and settlement reporting."],
  ["Insights", "Verified portfolio and performance analytics."],
] as const;

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
              <a href="#studio-operations" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Production & DIT</strong><p className="mt-1 text-sm text-muted">Production operations and media handover</p></a>
              <Link to="/account" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Account</strong><p className="mt-1 text-sm text-muted">Studio account profile</p></Link>
              <a href="#studio-dit" className="rounded-sm border border-line p-4 hover:border-accent"><strong>DIT Agent</strong><p className="mt-1 text-sm text-muted">Camera-card manifest, checksum evidence and sign-off</p></a>
            </section>

            <section id="studio-titles" className="space-y-6">
              <div className="space-y-4">
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
              </div>

              <div className="border-t border-line pt-5">
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
              <StudioMemberDesk actor={actor} />
            </section>

            <section id="studio-dit" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Studio DIT Agent</h3>
                <p className="mt-1 text-sm text-muted">Register source-card manifests, compare Primary and Recovery manifest evidence, and record operator sign-off. Server actions are restricted to active Studio owner, admin, producer or DIT memberships.</p>
              </div>
              <DitAgentDesk actor={actor} />
            </section>

            <section id="studio-operations" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Coming soon</h3>
                <p className="mt-1 text-sm text-muted">These modules are not connected yet. They are shown for visibility only and are not presented as active services.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {comingSoonModules.map(([name, description]) => (
                  <article key={name} className="rounded-sm border border-dashed border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold">{name}</h4>
                      <span className="rounded-full border border-line px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Coming soon</span>
                    </div>
                    <p className="mt-2 text-sm text-muted">{description}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}