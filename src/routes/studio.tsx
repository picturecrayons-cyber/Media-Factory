import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

const studioModules = [
  ["Organization", "Studio profile and organization workspace.", "Organization data is shown only when the verified organization mapping is available."],
  ["Members & Roles", "View verified studio members and their current organization roles.", "Read-only roster is available below; invitations and role changes remain gated."],
  ["Productions", "Track projects, production stages and title ownership.", "Production project tracking is not connected yet."],
  ["DIT & Media", "Coordinate media intake, checksums, copies and handover sign-off.", "DIT manifests and sign-off workflow are not connected yet."],
  ["QC & Rights", "Follow quality-control and rights-review progress.", "Use the status shown on each title; separate review approvals remain authoritative."],
  ["Deliveries", "Track approved delivery packages.", "Open the current Deliveries workspace for available records."],
  ["Schedule", "Coordinate production and delivery milestones.", "A shared studio schedule is not connected yet."],
  ["Statements", "Review verified licensing and settlement records.", "Financial statements are not connected yet."],
  ["Insights", "Review verified studio portfolio activity.", "Studio analytics are not connected yet."],
  ["Help", "Get help with studio onboarding and production workflows.", "Use the existing Bridge support channel."],
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

            <section id="studio-members" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Members & Roles</h3>
                <p className="mt-1 text-sm text-muted">Members are resolved from the authenticated Studio organization membership, never from a matching organization name.</p>
              </div>
              <StudioMemberDesk />
            </section>

            <section id="studio-operations" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Studio operations</h3>
                <p className="mt-1 text-sm text-muted">The modules below define the intended Studio dashboard. Unimplemented data sources are explicitly marked; no synthetic members, productions or financial values are displayed.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {studioModules.map(([name, description, status]) => (
                  <article key={name} className="rounded-sm border border-line p-4">
                    <h4 className="font-semibold">{name}</h4>
                    <p className="mt-1 text-sm">{description}</p>
                    <p className="mt-3 text-xs text-muted">{status}</p>
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
