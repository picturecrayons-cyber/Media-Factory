import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

const studioModules = [
  ["Organization", "Verified Studio profile and organization workspace.", "Organization scope is resolved by the server from active membership; no name-based scope is inferred."],
  ["Members & Roles", "Verified organization roster and Studio access.", "Roster is read-only. Invitations and role changes are intentionally disabled until dedicated audited RBAC controls are enabled."],
  ["Productions", "Coordinate production against canonical Bridge titles.", "Use Studio Titles and DIT ingest for the current supported workflow. Standalone production scheduling remains unconnected."],
  ["QC & Rights", "Track quality-control and rights-review progress.", "QC, Legal, Rights and Publishing remain separate authoritative approval gates."],
  ["Deliveries", "Track vendor requests and approved delivery packages.", "Open Deliveries for persisted jobs. Vendor receipt and Super Admin approval remain separate controls."],
  ["Schedule", "Coordinate production and delivery milestones.", "No shared schedule source is connected; no synthetic dates or milestones are displayed."],
  ["Statements", "Review captured payments and verified settlement records.", "Only verified payment and settlement rows can support financial statements. No estimated revenue is displayed."],
  ["Insights", "Review verified Studio portfolio activity.", "Analytics are limited to persisted records; no estimated audience, revenue or storage figures are shown."],
  ["Help", "Studio onboarding and production support.", "Use the existing Bridge support channel."],
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
              <a href="#studio-dit" className="rounded-sm border border-line p-4 hover:border-accent"><strong>DIT Agent</strong><p className="mt-1 text-sm text-muted">Camera-to-Cloud ingest, Primary / Recovery vault checks and sign-off</p></a>
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
                <p className="mt-1 text-sm text-muted">Read-only roster for verified Studio owners and administrators. Role changes and invitations remain disabled until separately approved.</p>
              </div>
              <StudioMemberDesk />
            </section>

            <section id="studio-dit" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Studio DIT Agent</h3>
                <p className="mt-1 text-sm text-muted">Camera-to-Cloud ingest for Camera A / B / C: register the source-card manifest, upload original media to the Primary Vault, verify the independently created Recovery Vault copy using SHA-256 evidence, then record operator sign-off. Original folder paths and filenames must be preserved. Server actions are restricted to active Studio owner, admin, producer or DIT memberships.</p>
              </div>
              <div className="rounded-sm border border-line p-4 text-sm text-muted">
                <strong className="text-foreground">Production boundary</strong>
                <p className="mt-1">The current DIT desk covers manifest registration, OCI upload requests, Primary / Recovery copy verification and operator sign-off. Proxy generation and paid DIT service fulfilment are separate workflows; this dashboard does not mark them complete.</p>
              </div>
              <DitAgentDesk actor={actor} />
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
